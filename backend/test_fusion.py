# -*- coding: utf-8 -*-
"""
UniLab-OS x Lab_Device_System 融合功能端到端接口与回归测试
使用独立临时 SQLite 库隔离运行，不污染生产演示数据库。
"""

import io
import os
import sys
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

_TMP_DB = tempfile.NamedTemporaryFile(prefix="unilab_fusion_test_", suffix=".db", delete=False)
_TMP_DB.close()
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP_DB.name}"

from backend.main import app  # noqa: E402
from backend.lab_services import HAS_OPENPYXL, sanitize_spreadsheet_cell  # noqa: E402


class FusionRegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.hw_headers = {"X-Lab-Hardware-Token": os.getenv("LAB_HARDWARE_TOKEN", "UNILAB_HW_SECRET_2026")}

    @classmethod
    def tearDownClass(cls):
        try:
            cls.client.close()
        finally:
            try:
                os.unlink(_TMP_DB.name)
            except OSError:
                pass

    def test_01_bootstrap_has_rooms_policies_and_five_roles(self):
        resp = self.client.get("/api/v1/bootstrap?operator_user_id=1&project_id=1")
        self.assertEqual(resp.status_code, 200)
        body = resp.json()

        self.assertGreaterEqual(len(body["rooms"]), 6)
        floors = {r["floor"] for r in body["rooms"]}
        self.assertTrue({"1F", "2F", "3F"}.issubset(floors))

        policies = body["role_visibility_policies"]
        for role in ("ADMIN", "DEPT_HEAD", "PI", "STAFF", "OBSERVER"):
            self.assertIn(role, policies)
        self.assertTrue(policies["ADMIN"]["modules"]["roles"])
        self.assertFalse(policies["OBSERVER"]["modules"]["billing"])

        roles_present = {u["system_role"] for u in body["users"]}
        self.assertTrue({"ADMIN", "DEPT_HEAD", "PI", "STAFF", "OBSERVER"}.issubset(roles_present))

    def test_02_visibility_policies_admin_only_and_persistent(self):
        # 查找一个非 ADMIN 用户验证越权拦截
        users = self.client.get("/api/v1/bootstrap").json()["users"]
        non_admin = next(u for u in users if u["system_role"] != "ADMIN")
        admin_user = next(u for u in users if u["system_role"] == "ADMIN")

        cur = self.client.get("/api/v1/system/visibility-policies").json()["policies"]
        cur["PI"]["modules"]["billing"] = False
        cur["ADMIN"]["modules"]["roles"] = False  # 应触发防锁死强制保持 True

        deny = self.client.put(
            "/api/v1/system/visibility-policies",
            json={"operator_user_id": non_admin["id"], "policies": cur},
        )
        self.assertEqual(deny.status_code, 403)

        ok = self.client.put(
            "/api/v1/system/visibility-policies",
            json={"operator_user_id": admin_user["id"], "policies": cur},
        )
        self.assertEqual(ok.status_code, 200)
        saved = ok.json()["policies"]
        self.assertFalse(saved["PI"]["modules"]["billing"])
        self.assertTrue(saved["ADMIN"]["modules"]["roles"])

        reset = self.client.post(f"/api/v1/system/visibility-policies/reset?operator_user_id={admin_user['id']}")
        self.assertEqual(reset.status_code, 200)
        self.assertTrue(reset.json()["policies"]["PI"]["modules"]["billing"])

    def test_03_rooms_crud_and_position_persistence(self):
        users = self.client.get("/api/v1/bootstrap").json()["users"]
        admin_user = next(u for u in users if u["system_role"] == "ADMIN")
        pi_user = next(u for u in users if u["system_role"] == "PI")

        create_resp = self.client.post(
            "/api/v1/rooms",
            json={
                "operator_user_id": admin_user["id"],
                "code": "RM-299",
                "name": "299 超导物性联调室",
                "floor": "2F",
                "owner_dept_id": 1,
                "pos_x": 460,
                "pos_y": 480,
            },
        )
        self.assertEqual(create_resp.status_code, 200)
        room_id = create_resp.json()["id"]

        # PI 禁止拖动或调整房间坐标
        deny_move = self.client.patch(
            f"/api/v1/rooms/{room_id}/position",
            json={"operator_user_id": pi_user["id"], "pos_x": 510, "pos_y": 490},
        )
        self.assertEqual(deny_move.status_code, 403)

        move_ok = self.client.patch(
            f"/api/v1/rooms/{room_id}/position",
            json={"operator_user_id": admin_user["id"], "pos_x": 510, "pos_y": 490, "floor": "2F"},
        )
        self.assertEqual(move_ok.status_code, 200)

        rooms_after = self.client.get("/api/v1/rooms").json()
        target = next(r for r in rooms_after if r["id"] == room_id)
        self.assertEqual(target["pos_x"], 510)
        self.assertEqual(target["pos_y"], 490)
        self.assertEqual(target["floor"], "2F")

        del_ok = self.client.delete(f"/api/v1/rooms/{room_id}?operator_user_id={admin_user['id']}")
        self.assertEqual(del_ok.status_code, 200)

    def test_04_esp32_telemetry_schmitt_fault_lock_and_autodiscovery(self):
        # 1. 未携带 Token 默认必须被拦截 401
        unauth = self.client.post(
            "/api/v1/telemetry/ingest",
            json={"device_code": "CNC-01", "current": 1.2, "source_type": "ESP32_ACS712"},
        )
        self.assertEqual(unauth.status_code, 401)

        # 2. raw_data.current 回填 + 高于阈值进入 RUNNING
        r_run = self.client.post(
            "/api/v1/telemetry/ingest",
            headers=self.hw_headers,
            json={"device_code": "CNC-01", "source_type": "ESP32_ACS712", "raw_data": {"current": 2.40, "voltage": 221.0}},
        )
        self.assertEqual(r_run.status_code, 200)
        self.assertEqual(r_run.json()["results"][0]["status"], "RUNNING")

        # 3. 施密特死区 (0.20A) 维持 RUNNING
        r_hold = self.client.post(
            "/api/v1/telemetry/ingest",
            headers=self.hw_headers,
            json={"device_code": "CNC-01", "current": 0.20, "source_type": "ESP32_ACS712"},
        )
        self.assertEqual(r_hold.status_code, 200)
        self.assertEqual(r_hold.json()["results"][0]["status"], "RUNNING")

        # 4. 人工置为 FAULT 后，硬件遥测不得自动解锁 FAULT
        boot = self.client.get("/api/v1/bootstrap").json()
        admin_user = next(u for u in boot["users"] if u["system_role"] == "ADMIN")
        cnc = next(d for d in boot["devices"] if d["code"] == "CNC-01")
        fault_resp = self.client.post(
            f"/api/v1/fms/devices/{cnc['id']}/status",
            json={"operator_user_id": admin_user["id"], "new_status": "FAULT"},
        )
        self.assertEqual(fault_resp.status_code, 200)
        self.assertEqual(fault_resp.json()["status"], "FAULT")

        r_locked = self.client.post(
            "/api/v1/telemetry/ingest",
            headers=self.hw_headers,
            json={"device_code": "CNC-01", "current": 0.01, "status": "IDLE", "source_type": "ESP32_ACS712"},
        )
        self.assertEqual(r_locked.json()["results"][0]["status"], "FAULT")

        # 人工复位 FAULT -> IDLE
        reset_resp = self.client.post(
            f"/api/v1/fms/devices/{cnc['id']}/status",
            json={"operator_user_id": admin_user["id"], "new_status": "IDLE"},
        )
        self.assertEqual(reset_resp.status_code, 200)
        self.assertEqual(reset_resp.json()["status"], "IDLE")

        # 5. 未知设备自动发现进入未分配实验室
        disc = self.client.post(
            "/api/v1/telemetry/ingest",
            headers=self.hw_headers,
            json={"device_code": "ESP32-TEST-NEW", "current": 1.75, "source_type": "ESP32_ACS712"},
        )
        self.assertEqual(disc.status_code, 200)
        self.assertTrue(disc.json()["results"][0]["newly_discovered"])

    def test_05_reports_csv_injection_guard_and_excel_export(self):
        self.assertEqual(sanitize_spreadsheet_cell("=CMD|'/C calc'!A0"), "'=CMD|'/C calc'!A0")
        self.assertEqual(sanitize_spreadsheet_cell("+SUM(A1:A2)"), "'+SUM(A1:A2)")

        csv_resp = self.client.get("/api/v1/reports/export-csv")
        self.assertEqual(csv_resp.status_code, 200)
        self.assertIn("设备编号", csv_resp.content.decode("utf-8-sig"))

        if HAS_OPENPYXL:
            from openpyxl import load_workbook
            xls_resp = self.client.get("/api/v1/reports/export-excel")
            self.assertEqual(xls_resp.status_code, 200)
            wb = load_workbook(io.BytesIO(xls_resp.content))
            self.assertEqual(wb.sheetnames, ["实验室设备总览", "设备使用履历", "硬件审计日志"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
