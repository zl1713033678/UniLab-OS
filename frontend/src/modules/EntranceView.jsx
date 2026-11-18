import React, { useEffect, useState } from 'react';
import { Cpu, Radio, RefreshCw, Server, Wifi, WifiOff } from 'lucide-react';
import TabBar from '../components/ui/TabBar';
import DataTableShell from '../components/ui/DataTableShell';
import StatusBadge from '../components/ui/StatusBadge';
import { FormField, INPUT_CLS } from '../components/ui/FormField';
import { apiGet, apiPost } from '../api/client';

export default function EntranceView({
  data,
  currentOperator,
  entranceTab,
  setEntranceTab,
  hwToken,
  setHwToken,
  simRfid,
  setSimRfid,
  simTelemetry,
  setSimTelemetry,
  simIngest,
  setSimIngest,
  simResponseLog,
  setSimResponseLog,
  onTriggerSimRfid,
  onTriggerSimTelemetry,
  onTriggerSimIngest,
  onRefreshBootstrap,
}) {
  const newSeq = (prefix) => `${prefix}_${Math.floor(100000 + Math.random() * 900000)}`;
  const [sysInfo, setSysInfo] = useState(data?.system_info || null);
  const [hwNodes, setHwNodes] = useState([]);
  const [hwLogs, setHwLogs] = useState([]);
  const [espTestCode, setEspTestCode] = useState('CNC-01');
  const [espTestAmps, setEspTestAmps] = useState('1.85');

  const loadHardwareOverview = () => {
    Promise.all([
      apiGet('/api/v1/system/info'),
      apiGet('/api/v1/hardware/status'),
      apiGet('/api/v1/hardware/logs?limit=40'),
    ])
      .then(([info, nodes, logs]) => {
        setSysInfo(info);
        setHwNodes(Array.isArray(nodes) ? nodes : []);
        setHwLogs(Array.isArray(logs) ? logs : []);
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (entranceTab === 'nodes') {
      loadHardwareOverview();
    }
  }, [entranceTab, data?.devices]);

  const handleTestEsp32Ingest = async () => {
    try {
      const res = await apiPost(
        '/api/v1/telemetry/ingest',
        {
          device_code: espTestCode.trim() || 'CNC-01',
          source_type: 'ESP32_ACS712',
          raw_data: { current: Number(espTestAmps || 0), voltage: 220.5 },
        },
        { 'X-Lab-Hardware-Token': hwToken }
      );
      setSimResponseLog?.(JSON.stringify(res, null, 2));
      loadHardwareOverview();
      onRefreshBootstrap?.();
    } catch (err) {
      setSimResponseLog?.(`ERROR: ${err.message}`);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-base font-bold text-slate-900">门禁、边缘物联网与 ESP32 硬件接入网关</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          基于 <code className="font-mono text-blue-700">X-Lab-Hardware-Token</code> 鉴权与{' '}
          <code className="font-mono text-blue-700">seq_id</code> 防重放幂等控制；兼容 ESP32 + ACS712 高速遥测与 mDNS 自动发现
        </p>
      </div>

      <TabBar
        label="硬件接口调试切换"
        tabs={[
          { id: 'nodes', label: 'ESP32 接入与心跳监控' },
          { id: 'rfid', label: '门禁 / 终端 RFID 刷卡核验' },
          { id: 'telemetry', label: '智能插座电流遥测上报' },
          { id: 'ingest', label: '仪器数据自动抓取入库' },
        ]}
        activeId={entranceTab}
        onChange={setEntranceTab}
      />

      {currentOperator?.system_role === 'DEPT_HEAD' && (
        <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800">
          当前以【科室主任】视图访问网关控制台：可调试本科室授权硬件节点，全局安全开关由超级管理员在「系统设置」中管理。
        </div>
      )}

      <div className="max-w-xl p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
        <FormField label="硬件网关鉴权密钥 (X-Lab-Hardware-Token)">
          {(props) => (
            <input
              {...props}
              type="text"
              spellCheck={false}
              value={hwToken}
              onChange={(e) => setHwToken(e.target.value)}
              className={`${INPUT_CLS} font-mono`}
            />
          )}
        </FormField>
      </div>

      {entranceTab === 'rfid' && (
        <div className="max-w-xl p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-3.5 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <FormField label="受控仪器编码">
              {(props) => (
                <input
                  {...props}
                  type="text"
                  spellCheck={false}
                  value={simRfid.device_code}
                  onChange={(e) => setSimRfid({ ...simRfid, device_code: e.target.value })}
                  className={`${INPUT_CLS} font-mono`}
                />
              )}
            </FormField>
            <FormField label="RFID 卡号">
              {(props) => (
                <input
                  {...props}
                  type="text"
                  spellCheck={false}
                  value={simRfid.rfid_card_id}
                  onChange={(e) => setSimRfid({ ...simRfid, rfid_card_id: e.target.value })}
                  className={`${INPUT_CLS} font-mono`}
                />
              )}
            </FormField>
            <FormField label="指定项目编码">
              {(props) => (
                <input
                  {...props}
                  type="text"
                  spellCheck={false}
                  value={simRfid.project_code}
                  onChange={(e) => setSimRfid({ ...simRfid, project_code: e.target.value })}
                  className={`${INPUT_CLS} font-mono`}
                />
              )}
            </FormField>
            <FormField label="幂等序列号 (seq_id)">
              {(props) => (
                <div className="flex gap-1.5">
                  <input
                    {...props}
                    type="text"
                    spellCheck={false}
                    value={simRfid.seq_id}
                    onChange={(e) => setSimRfid({ ...simRfid, seq_id: e.target.value })}
                    className={`${INPUT_CLS} font-mono`}
                  />
                  <button
                    type="button"
                    aria-label="生成新的 RFID seq_id"
                    onClick={() => setSimRfid({ ...simRfid, seq_id: newSeq('RFID_REQ') })}
                    className="px-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-600"
                  >
                    <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              )}
            </FormField>
          </div>
          <button
            type="button"
            onClick={onTriggerSimRfid}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm"
          >
            执行刷卡开机核验
          </button>
        </div>
      )}

      {entranceTab === 'telemetry' && (
        <div className="max-w-xl p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-3.5 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <FormField label="仪器编码">
              {(props) => (
                <input
                  {...props}
                  type="text"
                  spellCheck={false}
                  value={simTelemetry.device_code}
                  onChange={(e) =>
                    setSimTelemetry({ ...simTelemetry, device_code: e.target.value })
                  }
                  className={`${INPUT_CLS} font-mono`}
                />
              )}
            </FormField>
            <FormField label="实测电流 (A)">
              {(props) => (
                <input
                  {...props}
                  type="text"
                  inputMode="decimal"
                  value={simTelemetry.rms_current_amps}
                  onChange={(e) =>
                    setSimTelemetry({ ...simTelemetry, rms_current_amps: e.target.value })
                  }
                  className={`${INPUT_CLS} font-mono`}
                />
              )}
            </FormField>
            <FormField label="物理状态">
              {(props) => (
                <select
                  {...props}
                  value={simTelemetry.power_state}
                  onChange={(e) =>
                    setSimTelemetry({ ...simTelemetry, power_state: e.target.value })
                  }
                  className={`${INPUT_CLS} font-mono`}
                >
                  <option value="RUNNING">RUNNING</option>
                  <option value="IDLE">IDLE</option>
                  <option value="FAULT">FAULT</option>
                </select>
              )}
            </FormField>
          </div>
          <FormField label="幂等报文序列号 (seq_id)" hint="重复相同 seq_id 会返回 idempotent_replay: true">
            {(props) => (
              <div className="flex gap-1.5">
                <input
                  {...props}
                  type="text"
                  spellCheck={false}
                  value={simTelemetry.seq_id}
                  onChange={(e) => setSimTelemetry({ ...simTelemetry, seq_id: e.target.value })}
                  className={`${INPUT_CLS} font-mono`}
                />
                <button
                  type="button"
                  aria-label="生成新的遥测 seq_id"
                  onClick={() => setSimTelemetry({ ...simTelemetry, seq_id: newSeq('ESP32_MSG') })}
                  className="px-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-600"
                >
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            )}
          </FormField>
          <button
            type="button"
            onClick={onTriggerSimTelemetry}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm"
          >
            上报终端电流数据（触发 WebSocket 广播）
          </button>
        </div>
      )}

      {entranceTab === 'nodes' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <Server className="w-4 h-4 text-blue-600" aria-hidden="true" />
                局域网接入与 mDNS
              </div>
              <div className="font-mono text-xs text-blue-700">
                {sysInfo?.lan_url || 'http://127.0.0.1:8000'}
              </div>
              <div className="text-[11px] text-slate-600">
                mDNS:{' '}
                <code className="font-mono font-semibold">{sysInfo?.mdns_host || 'smartlab.local'}</code>{' '}
                ({sysInfo?.mdns_active ? '已广播' : 'HTTP 回退模式'})
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <Radio className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                ESP32 遥测接入契约
              </div>
              <div className="font-mono text-[11px] text-slate-800">
                POST {sysInfo?.ingest_endpoint || '/api/v1/telemetry/ingest'}
              </div>
              <div className="text-[11px] text-slate-600">
                鉴权模式：
                {sysInfo?.allow_open_esp32_ingest ? '免 Token 兼容调试开启' : '强制校验 X-Lab-Hardware-Token'}
                {' · '}离线超时 {sysInfo?.offline_timeout_seconds ?? 10}s
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <Cpu className="w-4 h-4 text-amber-600" aria-hidden="true" />
                快速模拟 ESP32 ACS712 上报
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  aria-label="模拟设备编号"
                  value={espTestCode}
                  onChange={(e) => setEspTestCode(e.target.value)}
                  className={`${INPUT_CLS} font-mono text-xs`}
                  placeholder="CNC-01 或新编号"
                />
                <input
                  type="number"
                  step="0.1"
                  aria-label="模拟电流(A)"
                  value={espTestAmps}
                  onChange={(e) => setEspTestAmps(e.target.value)}
                  className={`${INPUT_CLS} w-24 font-mono text-xs`}
                />
                <button
                  type="button"
                  onClick={handleTestEsp32Ingest}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shrink-0"
                >
                  发送
                </button>
              </div>
            </div>
          </div>

          <DataTableShell caption="在线硬件采样节点实时心跳列表">
            <thead className="border-b border-slate-200 text-slate-700">
              <tr>
                <th scope="col" className="py-2 px-3 text-left">设备编号</th>
                <th scope="col" className="py-2 px-3 text-left">设备名称</th>
                <th scope="col" className="py-2 px-3 text-left">所在房间</th>
                <th scope="col" className="py-2 px-3 text-left">运行状态</th>
                <th scope="col" className="py-2 px-3 text-left">采样电流 / 电压</th>
                <th scope="col" className="py-2 px-3 text-left">来源协议</th>
                <th scope="col" className="py-2 px-3 text-left">心跳状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {hwNodes.map((n) => (
                <tr key={n.device_id} className="hover:bg-blue-50/40">
                  <td className="py-2 px-3 font-mono font-bold text-blue-700">{n.device_code}</td>
                  <td className="py-2 px-3 font-medium text-slate-900">{n.name}</td>
                  <td className="py-2 px-3 text-slate-600">{n.room_name}</td>
                  <td className="py-2 px-3">
                    <StatusBadge status={n.status} />
                  </td>
                  <td className="py-2 px-3 font-mono tabular-nums text-xs">
                    {n.current_amps}A / {n.voltage}V
                  </td>
                  <td className="py-2 px-3 font-mono text-[11px]">{n.telemetry_source}</td>
                  <td className="py-2 px-3 text-xs">
                    {n.is_online ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                        <Wifi className="w-3.5 h-3.5" aria-hidden="true" />
                        在线{n.seconds_since_heartbeat != null ? ` (${n.seconds_since_heartbeat}s前)` : ''}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-slate-500 font-medium">
                        <WifiOff className="w-3.5 h-3.5" aria-hidden="true" />
                        已离线
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTableShell>

          <DataTableShell caption="硬件状态跃迁与离线/发现审计流水">
            <thead className="border-b border-slate-200 text-slate-700">
              <tr>
                <th scope="col" className="py-2 px-3 text-left">时间(UTC)</th>
                <th scope="col" className="py-2 px-3 text-left">设备编号</th>
                <th scope="col" className="py-2 px-3 text-left">原状态</th>
                <th scope="col" className="py-2 px-3 text-left">新状态</th>
                <th scope="col" className="py-2 px-3 text-left">采样值</th>
                <th scope="col" className="py-2 px-3 text-left">来源</th>
                <th scope="col" className="py-2 px-3 text-left">备注 / 载荷</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {hwLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-500 text-xs">
                    暂无硬件状态跃迁日志（可在上方触发仿真或接通 ESP32 后查看）
                  </td>
                </tr>
              ) : (
                hwLogs.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-mono text-[11px]">{l.created_at}</td>
                    <td className="py-2 px-3 font-mono font-bold text-blue-700">{l.device_code}</td>
                    <td className="py-2 px-3 font-mono text-xs">{l.previous_status}</td>
                    <td className="py-2 px-3">
                      <StatusBadge status={l.new_status} />
                    </td>
                    <td className="py-2 px-3 font-mono text-xs">
                      {l.current_amps}A / {l.voltage}V
                    </td>
                    <td className="py-2 px-3 font-mono text-[11px]">{l.source_type}</td>
                    <td className="py-2 px-3 text-xs text-slate-600">{l.raw_data || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </DataTableShell>
        </div>
      )}

      {entranceTab === 'ingest' && (
        <div className="max-w-xl p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-3.5 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <FormField label="样品条码">
              {(props) => (
                <input
                  {...props}
                  type="text"
                  spellCheck={false}
                  value={simIngest.barcode}
                  onChange={(e) => setSimIngest({ ...simIngest, barcode: e.target.value })}
                  className={`${INPUT_CLS} font-mono`}
                />
              )}
            </FormField>
            <FormField label="分析仪器编码">
              {(props) => (
                <input
                  {...props}
                  type="text"
                  spellCheck={false}
                  value={simIngest.instrument_code}
                  onChange={(e) => setSimIngest({ ...simIngest, instrument_code: e.target.value })}
                  className={`${INPUT_CLS} font-mono`}
                />
              )}
            </FormField>
          </div>
          <FormField label="结构化谱图指标 JSON">
            {(props) => (
              <textarea
                {...props}
                rows={3}
                value={simIngest.raw_metrics_text}
                onChange={(e) => setSimIngest({ ...simIngest, raw_metrics_text: e.target.value })}
                className={`${INPUT_CLS} font-mono`}
              />
            )}
          </FormField>
          <button
            type="button"
            onClick={onTriggerSimIngest}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm"
          >
            回传测样数据
          </button>
        </div>
      )}

      {simResponseLog && (
        <section aria-label="硬件网关响应报文" className="max-w-xl">
          <h2 className="text-xs font-semibold text-slate-600 mb-1">网关响应日志</h2>
          <pre className="p-3.5 rounded-xl bg-slate-900 text-emerald-300 font-mono text-xs overflow-x-auto shadow-inner">
            {simResponseLog}
          </pre>
        </section>
      )}
    </div>
  );
}
