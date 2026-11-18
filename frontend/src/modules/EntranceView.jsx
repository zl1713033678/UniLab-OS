import React from 'react';
import { RefreshCw } from 'lucide-react';
import TabBar from '../components/ui/TabBar';
import { FormField, INPUT_CLS } from '../components/ui/FormField';

export default function EntranceView({
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
  onTriggerSimRfid,
  onTriggerSimTelemetry,
  onTriggerSimIngest,
}) {
  const newSeq = (prefix) => `${prefix}_${Math.floor(100000 + Math.random() * 900000)}`;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-base font-bold text-slate-900">门禁、边缘物联网与仪器 Agent 网关调试台</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          基于 <code className="font-mono text-blue-700">X-Lab-Hardware-Token</code> 鉴权与{' '}
          <code className="font-mono text-blue-700">seq_id</code> 防重放幂等控制
        </p>
      </div>

      <TabBar
        label="硬件接口调试切换"
        tabs={[
          { id: 'rfid', label: '门禁 / 终端 RFID 刷卡核验' },
          { id: 'telemetry', label: '智能插座电流遥测上报' },
          { id: 'ingest', label: '仪器数据自动抓取入库' },
        ]}
        activeId={entranceTab}
        onChange={setEntranceTab}
      />

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
