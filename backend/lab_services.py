# -*- coding: utf-8 -*-
"""
UniLab-OS 空间拓扑、硬件遥测状态机、多角色可视策略与报表服务
"""

import copy
import csv
import io
import json
import os
import socket
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

from fastapi import WebSocket
from sqlalchemy.orm import Session

from .billing_engine import quantize_dec
from .models import Device, DeviceUsageLog, LabRoom, SystemSetting

try:
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    HAS_OPENPYXL = True
except ImportError:
    HAS_OPENPYXL = False

try:
    from zeroconf import ServiceInfo, Zeroconf
    HAS_ZEROCONF = True
except ImportError:
    HAS_ZEROCONF = False


# ==================== 默认 5 级角色界面可视策略 ====================

DEFAULT_ROLE_VISIBILITY_POLICIES: Dict[str, Dict[str, Any]] = {
    "ADMIN": {
        "modules": {
            "profile": True,
            "equipments": True,
            "samples": True,
            "consumables": True,
            "labs": True,
            "people": True,
            "billing": True,
            "eln": True,
            "entrance": True,
            "roles": True,
        },
        "floorplan": {
            "view_all_depts": True,
            "show_telemetry": True,
            "show_heatmap": True,
            "edit_rooms": True,
            "control_device_status": True,
            "handle_hardware_discovery": True,
        },
        "data": {
            "show_sidebar_balance": True,
            "show_global_finance": True,
            "show_org_management": True,
            "export_reports": True,
        },
    },
    "DEPT_HEAD": {
        "modules": {
            "profile": True,
            "equipments": True,
            "samples": True,
            "consumables": True,
            "labs": True,
            "people": True,
            "billing": True,
            "eln": True,
            "entrance": True,
            "roles": False,
        },
        "floorplan": {
            "view_all_depts": True,
            "show_telemetry": True,
            "show_heatmap": True,
            "edit_rooms": True,
            "control_device_status": True,
            "handle_hardware_discovery": True,
        },
        "data": {
            "show_sidebar_balance": True,
            "show_global_finance": True,
            "show_org_management": True,
            "export_reports": True,
        },
    },
    "PI": {
        "modules": {
            "profile": True,
            "equipments": True,
            "samples": True,
            "consumables": True,
            "labs": True,
            "people": True,
            "billing": True,
            "eln": True,
            "entrance": False,
            "roles": False,
        },
        "floorplan": {
            "view_all_depts": True,
            "show_telemetry": True,
            "show_heatmap": True,
            "edit_rooms": False,
            "control_device_status": False,
            "handle_hardware_discovery": False,
        },
        "data": {
            "show_sidebar_balance": True,
            "show_global_finance": False,
            "show_org_management": False,
            "export_reports": True,
        },
    },
    "STAFF": {
        "modules": {
            "profile": True,
            "equipments": True,
            "samples": True,
            "consumables": True,
            "labs": True,
            "people": True,
            "billing": False,
            "eln": True,
            "entrance": False,
            "roles": False,
        },
        "floorplan": {
            "view_all_depts": True,
            "show_telemetry": True,
            "show_heatmap": True,
            "edit_rooms": False,
            "control_device_status": True,
            "handle_hardware_discovery": False,
        },
        "data": {
            "show_sidebar_balance": True,
            "show_global_finance": False,
            "show_org_management": False,
            "export_reports": True,
        },
    },
    "OBSERVER": {
        "modules": {
            "profile": True,
            "equipments": True,
            "samples": False,
            "consumables": False,
            "labs": False,
            "people": False,
            "billing": False,
            "eln": True,
            "entrance": False,
            "roles": False,
        },
        "floorplan": {
            "view_all_depts": True,
            "show_telemetry": True,
            "show_heatmap": True,
            "edit_rooms": False,
            "control_device_status": False,
            "handle_hardware_discovery": False,
        },
        "data": {
            "show_sidebar_balance": False,
            "show_global_finance": False,
            "show_org_management": False,
            "export_reports": False,
        },
    },
}

DEFAULT_HARDWARE_GATEWAY_SETTINGS: Dict[str, Any] = {
    "allow_open_esp32_ingest": os.getenv("ALLOW_OPEN_ESP32_INGEST", "false").lower() == "true",
    "offline_timeout_seconds": int(os.getenv("HARDWARE_OFFLINE_TIMEOUT_SECONDS", "10")),
    "schmitt_high_amps": os.getenv("SCHMITT_HIGH_AMPS", "0.5000"),
    "schmitt_low_amps": os.getenv("SCHMITT_LOW_AMPS", "0.0500"),
    "mdns_enabled": os.getenv("MDNS_ENABLED", "true").lower() == "true",
    "mdns_host": os.getenv("MDNS_SERVICE_HOST", "smartlab"),
}


def _deep_merge_dict(defaults: Dict[str, Any], override: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    merged = copy.deepcopy(defaults)
    if not isinstance(override, dict):
        return merged
    for k, v in override.items():
        if isinstance(v, dict) and isinstance(merged.get(k), dict):
            merged[k] = _deep_merge_dict(merged[k], v)
        else:
            merged[k] = v
    return merged


def get_visibility_policies(db: Session) -> Dict[str, Dict[str, Any]]:
    row = db.query(SystemSetting).filter(SystemSetting.key == "role_visibility_policies").first()
    raw = {}
    if row:
        try:
            raw = json.loads(row.value or "{}")
        except Exception:
            raw = {}
    merged = _deep_merge_dict(DEFAULT_ROLE_VISIBILITY_POLICIES, raw)
    # 安全兜底：确保超级管理员始终保有系统设置与个人档案入口，避免误锁死
    merged["ADMIN"]["modules"]["roles"] = True
    merged["ADMIN"]["modules"]["profile"] = True
    merged["ADMIN"]["modules"]["equipments"] = True
    return merged


def save_visibility_policies(
    db: Session,
    policies: Dict[str, Any],
    updated_by_user_id: Optional[int] = None,
) -> Dict[str, Dict[str, Any]]:
    merged = _deep_merge_dict(DEFAULT_ROLE_VISIBILITY_POLICIES, policies)
    merged["ADMIN"]["modules"]["roles"] = True
    merged["ADMIN"]["modules"]["profile"] = True
    merged["ADMIN"]["modules"]["equipments"] = True

    row = db.query(SystemSetting).filter(SystemSetting.key == "role_visibility_policies").first()
    encoded = json.dumps(merged, ensure_ascii=False)
    if row:
        row.value = encoded
        row.updated_by_user_id = updated_by_user_id
        row.updated_at = datetime.utcnow()
    else:
        db.add(
            SystemSetting(
                key="role_visibility_policies",
                value=encoded,
                updated_by_user_id=updated_by_user_id,
            )
        )
    db.commit()
    return merged


def get_role_permissions_override(db: Session) -> Optional[List[Dict[str, Any]]]:
    row = db.query(SystemSetting).filter(SystemSetting.key == "role_operational_permissions").first()
    if not row:
        return None
    try:
        parsed = json.loads(row.value or "null")
        return parsed if isinstance(parsed, list) else None
    except Exception:
        return None


def save_role_permissions_override(
    db: Session,
    roles_config: List[Dict[str, Any]],
    updated_by_user_id: Optional[int] = None,
) -> List[Dict[str, Any]]:
    row = db.query(SystemSetting).filter(SystemSetting.key == "role_operational_permissions").first()
    encoded = json.dumps(roles_config, ensure_ascii=False)
    if row:
        row.value = encoded
        row.updated_by_user_id = updated_by_user_id
        row.updated_at = datetime.utcnow()
    else:
        db.add(
            SystemSetting(
                key="role_operational_permissions",
                value=encoded,
                updated_by_user_id=updated_by_user_id,
            )
        )
    db.commit()
    return roles_config


def get_hardware_gateway_settings(db: Session) -> Dict[str, Any]:
    row = db.query(SystemSetting).filter(SystemSetting.key == "hardware_gateway_settings").first()
    raw = {}
    if row:
        try:
            raw = json.loads(row.value or "{}")
        except Exception:
            raw = {}
    return _deep_merge_dict(DEFAULT_HARDWARE_GATEWAY_SETTINGS, raw)


def save_hardware_gateway_settings(
    db: Session,
    settings_data: Dict[str, Any],
    updated_by_user_id: Optional[int] = None,
) -> Dict[str, Any]:
    merged = _deep_merge_dict(DEFAULT_HARDWARE_GATEWAY_SETTINGS, settings_data)
    row = db.query(SystemSetting).filter(SystemSetting.key == "hardware_gateway_settings").first()
    encoded = json.dumps(merged, ensure_ascii=False)
    if row:
        row.value = encoded
        row.updated_by_user_id = updated_by_user_id
        row.updated_at = datetime.utcnow()
    else:
        db.add(
            SystemSetting(
                key="hardware_gateway_settings",
                value=encoded,
                updated_by_user_id=updated_by_user_id,
            )
        )
    db.commit()
    return merged


# ==================== 序列化：房间与设备 ====================

def serialize_rooms(db: Session) -> List[Dict[str, Any]]:
    rooms = db.query(LabRoom).order_by(LabRoom.floor.asc(), LabRoom.id.asc()).all()
    devices = db.query(Device).all()
    devs_by_room: Dict[int, List[Device]] = {}
    for d in devices:
        if d.room_id:
            devs_by_room.setdefault(d.room_id, []).append(d)

    result = []
    for r in rooms:
        room_devs = devs_by_room.get(r.id, [])
        total_current = sum((quantize_dec(d.current_amps) for d in room_devs), Decimal("0.0000"))
        has_fault = any(d.status == "FAULT" for d in room_devs)
        has_running = any(d.status in ("RUNNING", "OVERTIME_RUNNING") for d in room_devs)
        result.append(
            {
                "id": r.id,
                "code": r.code,
                "name": r.name,
                "floor": r.floor,
                "owner_dept_id": r.owner_dept_id,
                "owner_dept_name": r.owner_department.name if r.owner_department else "公共/未划拨",
                "pos_x": r.pos_x,
                "pos_y": r.pos_y,
                "width": r.width,
                "height": r.height,
                "power_capacity_amps": str(quantize_dec(r.power_capacity_amps)),
                "total_current_amps": str(quantize_dec(total_current)),
                "device_count": len(room_devs),
                "has_fault": has_fault,
                "has_running": has_running,
            }
        )
    return result


def serialize_devices(db: Session) -> List[Dict[str, Any]]:
    """序列化全部设备台账状态（含所在房间、在线心跳与采样电压）"""
    devices = db.query(Device).order_by(Device.id.asc()).all()
    result = []
    for d in devices:
        result.append(
            {
                "id": d.id,
                "code": d.code,
                "name": d.name,
                "owner_dept_id": d.owner_dept_id,
                "owner_dept_name": d.owner_department.name if d.owner_department else "",
                "room_id": d.room_id,
                "room_name": d.room.name if d.room else "未分配实验室",
                "room_floor": d.room.floor if d.room else "1F",
                "pos_x": d.pos_x,
                "pos_y": d.pos_y,
                "status": d.status,
                "standby_current_threshold": str(quantize_dec(d.standby_current_threshold)),
                "current_amps": str(quantize_dec(d.current_amps)),
                "voltage": str(quantize_dec(getattr(d, "voltage", Decimal("220.0000")))),
                "is_online": bool(getattr(d, "is_online", True)),
                "last_seen_at": d.last_seen_at.isoformat() if getattr(d, "last_seen_at", None) else None,
                "telemetry_source": getattr(d, "telemetry_source", "MANUAL_WEB") or "MANUAL_WEB",
                "internal_hourly_rate": str(quantize_dec(d.internal_hourly_rate)),
                "external_hourly_rate": str(quantize_dec(d.external_hourly_rate)),
                "penalty_factor": str(quantize_dec(d.penalty_factor)),
            }
        )
    return result


# ==================== WebSocket 实时广播中心 ====================

class LabConnectionManager:
    """管理前端实验室平面图与系统设置 WebSocket 实时连接"""

    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast_payload(self, payload: Dict[str, Any]):
        stale = []
        for conn in self.active_connections:
            try:
                await conn.send_json(payload)
            except Exception:
                stale.append(conn)
        for conn in stale:
            self.disconnect(conn)

    async def broadcast_state(
        self,
        event_name: str,
        devices_data: List[Dict[str, Any]],
        rooms_data: Optional[List[Dict[str, Any]]] = None,
        extra: Optional[Dict[str, Any]] = None,
    ):
        payload: Dict[str, Any] = {
            "event": event_name,
            "devices": devices_data,
            "timestamp": datetime.utcnow().isoformat(),
        }
        if rooms_data is not None:
            payload["rooms"] = rooms_data
        if extra:
            payload.update(extra)
        await self.broadcast_payload(payload)


ws_manager = LabConnectionManager()


# ==================== 硬件状态机与审计日志 ====================

def normalize_hardware_status(raw_status: Optional[str]) -> Optional[str]:
    if not raw_status:
        return None
    upper = str(raw_status).strip().upper()
    if upper in ("IN_USE", "ACTIVE", "ON"):
        return "RUNNING"
    if upper in ("IDLE", "RESERVED", "RUNNING", "OVERTIME_RUNNING", "FAULT"):
        return upper
    return None


def compute_schmitt_target_status(
    device: Device,
    amps: Decimal,
    reported_status: Optional[str],
    source_type: str,
    schmitt_high: Decimal,
    schmitt_low: Decimal,
) -> str:
    """
    结合 FAULT 人工锁定保护与施密特迟滞区间计算目标物理状态。
    - 若当前为 FAULT，非人工/平台端重置命令禁止遥测自动清除告警；
    - 高于高阈值 -> RUNNING；低于低阈值 -> IDLE；处于迟滞死区维持当前运行/待机态。
    """
    is_manual = source_type in ("MANUAL_WEB", "MANUAL_APP")
    normalized = normalize_hardware_status(reported_status)

    if device.status == "FAULT" and not is_manual:
        return "FAULT"
    if normalized == "FAULT":
        return "FAULT"
    if is_manual and normalized in ("IDLE", "RESERVED", "RUNNING", "FAULT"):
        return normalized

    high_limit = max(schmitt_high, Decimal("0.2000"))
    low_limit = min(schmitt_low, high_limit)

    if amps >= quantize_dec(device.standby_current_threshold) or amps >= high_limit:
        return "RUNNING"
    if amps <= low_limit:
        return "RESERVED" if device.status == "RESERVED" else "IDLE"

    if normalized in ("RUNNING", "IDLE"):
        return normalized if amps > high_limit or amps <= low_limit else device.status
    return device.status if device.status in ("RUNNING", "OVERTIME_RUNNING", "RESERVED") else "IDLE"


def record_device_usage_log(
    db: Session,
    device: Device,
    previous_status: str,
    new_status: str,
    amps: Decimal,
    voltage: Decimal,
    source_type: str,
    operator_name: str,
    raw_data: Optional[str] = None,
):
    db.add(
        DeviceUsageLog(
            device_id=device.id,
            device_code=device.code,
            previous_status=previous_status,
            new_status=new_status,
            current_amps=quantize_dec(amps),
            voltage=quantize_dec(voltage),
            source_type=source_type,
            operator_name=operator_name,
            raw_data=raw_data,
        )
    )


# ==================== 使用履历统计与防注入 CSV / Excel 导出 ====================

def build_usage_sessions(db: Session) -> List[Dict[str, Any]]:
    logs = db.query(DeviceUsageLog).order_by(DeviceUsageLog.created_at.asc(), DeviceUsageLog.id.asc()).all()
    devices_map = {d.code: d for d in db.query(Device).all()}
    active_sessions: Dict[str, DeviceUsageLog] = {}
    sessions: List[Dict[str, Any]] = []

    def fmt_dur(sec: int) -> str:
        hrs, rem = divmod(max(0, sec), 3600)
        mins, secs = divmod(rem, 60)
        if hrs > 0:
            return f"{hrs}小时{mins}分{secs}秒"
        if mins > 0:
            return f"{mins}分{secs}秒"
        return f"{secs}秒"

    for log in logs:
        if log.new_status in ("RUNNING", "OVERTIME_RUNNING") and log.device_code not in active_sessions:
            active_sessions[log.device_code] = log
        elif log.new_status in ("IDLE", "FAULT", "RESERVED") and log.device_code in active_sessions:
            start_log = active_sessions.pop(log.device_code)
            dur = int((log.created_at - start_log.created_at).total_seconds())
            dev = devices_map.get(log.device_code)
            sessions.append(
                {
                    "device_code": log.device_code,
                    "name": dev.name if dev else log.device_code,
                    "room_name": (dev.room.name if dev and dev.room else "未分配实验室"),
                    "start_time": start_log.created_at.strftime("%Y-%m-%d %H:%M:%S"),
                    "end_time": log.created_at.strftime("%Y-%m-%d %H:%M:%S"),
                    "duration_seconds": dur,
                    "formatted_duration": fmt_dur(dur),
                    "operator": start_log.operator_name,
                    "source_type": start_log.source_type,
                    "end_source": log.source_type,
                }
            )

    now = datetime.utcnow()
    for code, start_log in active_sessions.items():
        dur = int((now - start_log.created_at).total_seconds())
        dev = devices_map.get(code)
        sessions.append(
            {
                "device_code": code,
                "name": dev.name if dev else code,
                "room_name": (dev.room.name if dev and dev.room else "未分配实验室"),
                "start_time": start_log.created_at.strftime("%Y-%m-%d %H:%M:%S"),
                "end_time": "运行中",
                "duration_seconds": dur,
                "formatted_duration": fmt_dur(dur),
                "operator": start_log.operator_name,
                "source_type": start_log.source_type,
                "end_source": "-",
            }
        )

    sessions.reverse()
    return sessions


def sanitize_spreadsheet_cell(value: Any) -> str:
    """防止 CSV / Excel 单元格公式注入 (=, +, -, @, Tab/CR 前缀)"""
    text = str(value if value is not None else "")
    if text and text[0] in ("=", "+", "-", "@", "\t", "\r"):
        return f"'{text}"
    return text


def export_usage_csv_bytes(db: Session) -> bytes:
    sessions = build_usage_sessions(db)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["设备编号", "设备名称", "所在房间", "开机时间(UTC)", "结束时间(UTC)", "有效时长", "操作人/来源", "触发来源"])
    for s in sessions:
        writer.writerow(
            [
                sanitize_spreadsheet_cell(s["device_code"]),
                sanitize_spreadsheet_cell(s["name"]),
                sanitize_spreadsheet_cell(s["room_name"]),
                sanitize_spreadsheet_cell(s["start_time"]),
                sanitize_spreadsheet_cell(s["end_time"]),
                sanitize_spreadsheet_cell(s["formatted_duration"]),
                sanitize_spreadsheet_cell(s["operator"]),
                sanitize_spreadsheet_cell(s["source_type"]),
            ]
        )
    return output.getvalue().encode("utf-8-sig")


def export_usage_excel_bytes(db: Session) -> Optional[bytes]:
    if not HAS_OPENPYXL:
        return None
    sessions = build_usage_sessions(db)
    devices = serialize_devices(db)
    logs = db.query(DeviceUsageLog).order_by(DeviceUsageLog.created_at.desc()).limit(300).all()

    wb = Workbook()
    header_fill = PatternFill(start_color="0F172A", end_color="1D4ED8", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF", size=11)
    border_thin = Side(border_style="thin", color="CBD5E1")
    cell_border = Border(left=border_thin, right=border_thin, top=border_thin, bottom=border_thin)

    # Sheet 1: 资产概览
    ws1 = wb.active
    ws1.title = "实验室设备总览"
    headers1 = ["设备编号", "设备名称", "所属科室", "所在房间", "楼层", "运行状态", "当前电流(A)", "在线状态"]
    ws1.append(headers1)
    for col_idx in range(1, len(headers1) + 1):
        c = ws1.cell(row=1, column=col_idx)
        c.fill = header_fill
        c.font = header_font
        c.alignment = Alignment(horizontal="center")
        c.border = cell_border
    for d in devices:
        ws1.append(
            [
                sanitize_spreadsheet_cell(d["code"]),
                sanitize_spreadsheet_cell(d["name"]),
                sanitize_spreadsheet_cell(d["owner_dept_name"]),
                sanitize_spreadsheet_cell(d["room_name"]),
                sanitize_spreadsheet_cell(d["room_floor"]),
                sanitize_spreadsheet_cell(d["status"]),
                sanitize_spreadsheet_cell(d["current_amps"]),
                "ONLINE" if d["is_online"] else "OFFLINE",
            ]
        )

    # Sheet 2: 使用履历汇总
    ws2 = wb.create_sheet("设备使用履历")
    headers2 = ["设备编号", "设备名称", "所在房间", "开机时间(UTC)", "结束时间(UTC)", "时长(秒)", "格式化时长", "操作人", "触发来源"]
    ws2.append(headers2)
    for col_idx in range(1, len(headers2) + 1):
        c = ws2.cell(row=1, column=col_idx)
        c.fill = header_fill
        c.font = header_font
        c.border = cell_border
    for s in sessions:
        ws2.append(
            [
                sanitize_spreadsheet_cell(s["device_code"]),
                sanitize_spreadsheet_cell(s["name"]),
                sanitize_spreadsheet_cell(s["room_name"]),
                sanitize_spreadsheet_cell(s["start_time"]),
                sanitize_spreadsheet_cell(s["end_time"]),
                s["duration_seconds"],
                sanitize_spreadsheet_cell(s["formatted_duration"]),
                sanitize_spreadsheet_cell(s["operator"]),
                sanitize_spreadsheet_cell(s["source_type"]),
            ]
        )

    # Sheet 3: 硬件状态跃迁审计
    ws3 = wb.create_sheet("硬件审计日志")
    headers3 = ["记录时间(UTC)", "设备编号", "原状态", "新状态", "电流(A)", "电压(V)", "来源类型", "操作人", "备注"]
    ws3.append(headers3)
    for col_idx in range(1, len(headers3) + 1):
        c = ws3.cell(row=1, column=col_idx)
        c.fill = header_fill
        c.font = header_font
        c.border = cell_border
    for l in logs:
        ws3.append(
            [
                l.created_at.strftime("%Y-%m-%d %H:%M:%S"),
                sanitize_spreadsheet_cell(l.device_code),
                sanitize_spreadsheet_cell(l.previous_status),
                sanitize_spreadsheet_cell(l.new_status),
                str(quantize_dec(l.current_amps)),
                str(quantize_dec(l.voltage)),
                sanitize_spreadsheet_cell(l.source_type),
                sanitize_spreadsheet_cell(l.operator_name),
                sanitize_spreadsheet_cell(l.raw_data or "-"),
            ]
        )

    for ws in (ws1, ws2, ws3):
        for col in ws.columns:
            max_len = max((len(str(cell.value or "")) for cell in col), default=10)
            ws.column_dimensions[col[0].column_letter].width = min(max_len + 6, 36)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ==================== 局域网 IP 与 mDNS ZeroConf ====================

def get_lan_ipv4() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"


class MDNSAdvertiser:
    """局域网 mDNS (_http._tcp.local.) 广播器（受限于端口或防火墙时优雅降级）"""

    def __init__(self):
        self.zc: Optional[Any] = None
        self.info: Optional[Any] = None
        self.active: bool = False
        self.host_fqdn: str = ""
        self.ip: str = "127.0.0.1"

    def start(self, host_prefix: str = "smartlab", port: int = 8000):
        self.ip = get_lan_ipv4()
        self.host_fqdn = f"{host_prefix}.local"
        if not HAS_ZEROCONF:
            self.active = False
            return
        try:
            self.zc = Zeroconf()
            self.info = ServiceInfo(
                "_http._tcp.local.",
                f"UniLab-OS Gateway._http._tcp.local.",
                addresses=[socket.inet_aton(self.ip)],
                port=port,
                properties={"service": "unilab-os", "version": "2.0"},
                server=f"{host_prefix}.local.",
            )
            self.zc.register_service(self.info)
            self.active = True
        except Exception:
            self.active = False

    def stop(self):
        if self.zc and self.info:
            try:
                self.zc.unregister_service(self.info)
            except Exception:
                pass
        if self.zc:
            try:
                self.zc.close()
            except Exception:
                pass
        self.active = False
        self.zc = None
        self.info = None


mdns_advertiser = MDNSAdvertiser()
