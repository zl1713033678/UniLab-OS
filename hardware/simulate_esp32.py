# -*- coding: utf-8 -*-
"""
UniLab-OS ESP32 ACS712 边缘传感器链路联调与 QA 仿真脚本
支持验证：
1. X-Lab-Hardware-Token 请求头鉴权
2. raw_data.current 优先回填与施密特迟滞防抖动状态流转
3. --new 参数触发未知设备自动发现入库与前端弹窗通知
"""

import argparse
import json
import sys
import time
import urllib.error
import urllib.request


def post_telemetry(base_url: str, token: str, payload: dict) -> dict:
    url = f"{base_url.rstrip('/')}/api/v1/telemetry/ingest"
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-Lab-Hardware-Token": token,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            body = resp.read().decode("utf-8")
            if resp.status < 200 or resp.status >= 300:
                raise RuntimeError(f"非预期 HTTP 状态码: {resp.status} -> {body}")
            return json.loads(body)
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"HTTP {err.code} 请求失败: {detail}") from err


def run_qa_sequence(base_url: str, token: str, device_code: str, auto_discovery: bool) -> int:
    print(f"[UniLab-OS Sim] 目标网关: {base_url} | 设备编码: {device_code}")

    if auto_discovery:
        print("-> [步骤 1] 上报未登记节点，验证自动发现机制...")
        res = post_telemetry(
            base_url,
            token,
            {
                "device_code": device_code,
                "status": "IN_USE",
                "source_type": "ESP32_ACS712",
                "raw_data": {"current": 1.65, "voltage": 221.4},
            },
        )
        print("   响应:", res)
        item = res["results"][0]
        if not item.get("newly_discovered"):
            print("❌ 预期 newly_discovered=True，请换一个全新 device_code 再试", file=sys.stderr)
            return 1
        print("✅ 未知物理节点自动发现并绑定成功！")
        return 0

    steps = [
        ("待机状态初始化", {"device_code": device_code, "current": 0.02, "voltage": 220.2, "source_type": "ESP32_ACS712"}),
        ("真实高负载运行（raw_data.current 优先回填）", {"device_code": device_code, "source_type": "ESP32_ACS712", "raw_data": {"current": 2.35, "voltage": 219.8}}),
        ("施密特迟滞死区维持 (0.20A 保持 RUNNING)", {"device_code": device_code, "current": 0.20, "voltage": 220.1, "source_type": "ESP32_ACS712"}),
        ("关机跌落回待机 (0.02A 回落待机)", {"device_code": device_code, "current": 0.02, "voltage": 220.4, "source_type": "ESP32_ACS712"}),
    ]

    for idx, (label, body) in enumerate(steps, start=1):
        print(f"-> [步骤 {idx}/4] {label}...")
        res = post_telemetry(base_url, token, body)
        status = res["results"][0]["status"]
        print(f"   状态结果: {status} | 响应: {res['results'][0]}")
        if idx == 2 and status != "RUNNING":
            print(f"❌ 步骤 2 期望 RUNNING，实际 {status}", file=sys.stderr)
            return 1
        if idx == 3 and status != "RUNNING":
            print(f"❌ 步骤 3 期望迟滞保持 RUNNING，实际 {status}", file=sys.stderr)
            return 1
        if idx == 4 and status not in ("IDLE", "RESERVED"):
            print(f"❌ 步骤 4 期望回落 IDLE/RESERVED，实际 {status}", file=sys.stderr)
            return 1
        time.sleep(1.0)

    print("✅ 全部 4 阶段硬件遥测与施密特迟滞测试通过！")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="UniLab-OS ESP32 ACS712 边缘传感器仿真脚本")
    parser.add_argument("--url", default="http://127.0.0.1:8000", help="UniLab-OS 后端地址")
    parser.add_argument("--token", default="UNILAB_HW_SECRET_2026", help="X-Lab-Hardware-Token 鉴权密钥")
    parser.add_argument("--device", default="CNC-01", help="目标仪器编码")
    parser.add_argument("--new", action="store_true", help="使用全新设备编码触发自动发现模式")
    args = parser.parse_args()

    code = f"ESP32-NEW-{int(time.time()) % 10000}" if args.new and args.device == "CNC-01" else args.device
    try:
        return run_qa_sequence(args.url, args.token, code, args.new)
    except Exception as exc:
        print(f"❌ 仿真执行失败: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
