import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Cpu,
  Flame,
  Lock,
  Pencil,
  Plus,
  Radio,
  RotateCcw,
  ShieldAlert,
  Unlock,
  Wifi,
  WifiOff,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import StatusBadge from './ui/StatusBadge';
import { FormField, INPUT_CLS } from './ui/FormField';

const FLOORS = [
  { id: '1F', label: '1F 精密分析层' },
  { id: '2F', label: '2F 光电合成层' },
  { id: '3F', label: '3F 智算监控层' },
];

/**
 * 1F/2F/3F SVG 数字孪生平面图与房间级实时监控台
 * 遵循 modern-web-guidance:
 * - 工具栏使用 role="toolbar" + focusgroup 兼顾无原生支持时的 roving tabindex 回退
 * - 开关控件使用 aria-pressed 且不改变文本标签
 * - 状态同时通过图形符号 + 文字区分（不依赖单一颜色）
 * - 创建/编辑/新设备发现弹窗采用原生 <dialog>.showModal()
 */
export default function FloorplanTwin({
  data,
  currentOperator,
  floorplanPolicy,
  discoveredDevice,
  onDismissDiscoveredDevice,
  onOpenDeviceDetail,
  onSwitchDeviceStatus,
  onSaveRoom,
  onDeleteRoom,
  onSaveRoomPosition,
  onAssignDiscoveredDevice,
  onRequestConfirm,
}) {
  const rooms = data.rooms || [];
  const devices = data.devices || [];
  const departments = data.departments || [];

  const [activeFloor, setActiveFloor] = useState('1F');
  const [heatmapMode, setHeatmapMode] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [toolbarAnnouncement, setToolbarAnnouncement] = useState('');

  // 拖拽状态（房间坐标编辑 & 画布平移）
  const [dragOverrides, setDragOverrides] = useState({});
  const dragRoomRef = useRef(null);
  const panDragRef = useRef(null);
  const svgRef = useRef(null);
  const toolbarRef = useRef(null);

  // 原生 <dialog> Refs & 表单状态
  const roomDialogRef = useRef(null);
  const discoveryDialogRef = useRef(null);
  const [editingRoom, setEditingRoom] = useState(null);
  const [roomForm, setRoomForm] = useState({
    code: '',
    name: '',
    floor: '1F',
    owner_dept_id: currentOperator?.home_dept_id || '',
    power_capacity_amps: '32.0000',
  });

  const [discoverForm, setDiscoverForm] = useState({
    name: '',
    owner_dept_id: '',
    room_id: '',
  });

  const isAdmin = currentOperator?.system_role === 'ADMIN';
  const isDeptHead = currentOperator?.system_role === 'DEPT_HEAD';
  const isStaff = currentOperator?.system_role === 'STAFF';

  const canManageRoom = (room) => {
    if (!floorplanPolicy?.edit_rooms) return false;
    if (isAdmin) return true;
    if (!isDeptHead) return false;
    return !room || room.owner_dept_id === currentOperator?.home_dept_id;
  };

  const canControlDevice = (dev) => {
    if (!floorplanPolicy?.control_device_status || !dev) return false;
    if (isAdmin) return true;
    return (
      (isDeptHead || isStaff) && dev.owner_dept_id === currentOperator?.home_dept_id
    );
  };

  // 按角色可视策略过滤房间作用域
  const visibleRooms = useMemo(() => {
    const scopeFiltered = floorplanPolicy?.view_all_depts
      ? rooms
      : rooms.filter(
          (r) =>
            r.owner_dept_id === currentOperator?.home_dept_id ||
            r.code === 'UNASSIGNED'
        );
    return scopeFiltered.filter((r) => (r.floor || '1F') === activeFloor);
  }, [rooms, activeFloor, floorplanPolicy?.view_all_depts, currentOperator?.home_dept_id]);

  // 房间内设备映射与真实电流统计（修复 BUG-007：全部依据真实 current_amps）
  const roomStatsMap = useMemo(() => {
    const map = {};
    for (const r of rooms) {
      const rDevs = devices.filter((d) => d.room_id === r.id);
      const totalCurrent = rDevs.reduce(
        (sum, d) => sum + Number(d.current_amps || 0),
        0
      );
      const capacity = Math.max(1, Number(r.power_capacity_amps || 32));
      const hasFault = rDevs.some((d) => d.status === 'FAULT');
      const hasRunning = rDevs.some((d) =>
        ['RUNNING', 'OVERTIME_RUNNING'].includes(d.status)
      );
      map[r.id] = {
        devices: rDevs,
        totalCurrent,
        loadRatio: Math.min(1, totalCurrent / capacity),
        hasFault,
        hasRunning,
      };
    }
    return map;
  }, [rooms, devices]);

  const unassignedDevices = useMemo(
    () => devices.filter((d) => !d.room_id),
    [devices]
  );

  const selectedRoom = useMemo(
    () => rooms.find((r) => r.id === selectedRoomId) || null,
    [rooms, selectedRoomId]
  );

  // 如果权限变更关闭了 edit_rooms，强制退出编辑态
  useEffect(() => {
    if (!floorplanPolicy?.edit_rooms && editMode) {
      setEditMode(false);
    }
    if (!floorplanPolicy?.show_heatmap && heatmapMode) {
      setHeatmapMode(false);
    }
  }, [floorplanPolicy?.edit_rooms, floorplanPolicy?.show_heatmap, editMode, heatmapMode]);

  // Toolbar roving-tabindex 回退：仅当浏览器原生不支持 focusgroup 时挂载
  useEffect(() => {
    const bar = toolbarRef.current;
    if (!bar || 'focusGroup' in HTMLElement.prototype) return undefined;

    const getItems = () =>
      Array.from(bar.querySelectorAll('button:not([hidden])'));

    const items = getItems();
    items.forEach((b, i) => {
      b.tabIndex = i === 0 ? 0 : -1;
    });

    const onFocusIn = (e) => {
      const curr = getItems();
      if (curr.includes(e.target)) {
        curr.forEach((b) => {
          b.tabIndex = b === e.target ? 0 : -1;
        });
      }
    };

    const onKeyDown = (e) => {
      const curr = getItems();
      const idx = curr.indexOf(document.activeElement);
      if (idx === -1 || curr.length === 0) return;

      let nextIdx = null;
      if (e.key === 'ArrowRight') nextIdx = (idx + 1) % curr.length;
      else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + curr.length) % curr.length;
      else if (e.key === 'Home') nextIdx = 0;
      else if (e.key === 'End') nextIdx = curr.length - 1;

      if (nextIdx !== null) {
        e.preventDefault();
        curr.forEach((b, i) => {
          b.tabIndex = i === nextIdx ? 0 : -1;
        });
        curr[nextIdx]?.focus();
      }
    };

    bar.addEventListener('focusin', onFocusIn);
    bar.addEventListener('keydown', onKeyDown);
    return () => {
      bar.removeEventListener('focusin', onFocusIn);
      bar.removeEventListener('keydown', onKeyDown);
    };
  }, [floorplanPolicy?.show_heatmap, floorplanPolicy?.edit_rooms, isAdmin, isDeptHead]);

  // Esc 快捷键关闭非模态房间详情抽屉
  useEffect(() => {
    if (!selectedRoom) return undefined;
    const onEsc = (e) => {
      if (e.key === 'Escape' && !roomDialogRef.current?.open && !discoveryDialogRef.current?.open) {
        setSelectedRoomId(null);
      }
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [selectedRoom]);

  // 新硬件自动发现弹窗同步打开（仅当管理员/科室主任开启 handle_hardware_discovery 策略时）
  useEffect(() => {
    const dlg = discoveryDialogRef.current;
    if (!dlg) return;
    if (discoveredDevice && floorplanPolicy?.handle_hardware_discovery) {
      const defaultDept = currentOperator?.home_dept_id || departments[0]?.id || '';
      const firstRoomOnDept =
        rooms.find((r) => r.owner_dept_id === Number(defaultDept) && r.code !== 'UNASSIGNED') ||
        rooms[0];
      setDiscoverForm({
        name: discoveredDevice.name || `新接入仪器 (${discoveredDevice.code})`,
        owner_dept_id: String(defaultDept),
        room_id: firstRoomOnDept ? String(firstRoomOnDept.id) : '',
      });
      if (!dlg.open) dlg.showModal();
    } else if (dlg.open) {
      dlg.close();
    }
  }, [discoveredDevice, floorplanPolicy?.handle_hardware_discovery]);

  const toSvgCoords = (clientX, clientY) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const scaleX = 1200 / Math.max(1, rect.width);
    const scaleY = 800 / Math.max(1, rect.height);
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const handleSvgPointerDown = (e) => {
    if (e.target.closest('.svg-lab-group')) return;
    panDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origPanX: pan.x,
      origPanY: pan.y,
    };
  };

  const handleRoomPointerDown = (e, room) => {
    if (!editMode || !canManageRoom(room)) return;
    e.stopPropagation();
    const pt = toSvgCoords(e.clientX, e.clientY);
    const curX = dragOverrides[room.id]?.pos_x ?? room.pos_x;
    const curY = dragOverrides[room.id]?.pos_y ?? room.pos_y;
    dragRoomRef.current = {
      room,
      offsetX: pt.x / zoom - curX,
      offsetY: pt.y / zoom - curY,
      moved: false,
    };
  };

  const handleSvgPointerMove = (e) => {
    if (dragRoomRef.current) {
      const { room, offsetX, offsetY } = dragRoomRef.current;
      const pt = toSvgCoords(e.clientX, e.clientY);
      const nextX = Math.round(Math.max(44, Math.min(1150 - room.width, pt.x / zoom - offsetX)));
      const nextY = Math.round(Math.max(44, Math.min(750 - room.height, pt.y / zoom - offsetY)));
      dragRoomRef.current.moved = true;
      setDragOverrides((prev) => ({
        ...prev,
        [room.id]: { pos_x: nextX, pos_y: nextY },
      }));
      return;
    }
    if (panDragRef.current) {
      const { startX, startY, origPanX, origPanY } = panDragRef.current;
      setPan({
        x: origPanX + (e.clientX - startX),
        y: origPanY + (e.clientY - startY),
      });
    }
  };

  const handleSvgPointerUp = async () => {
    if (dragRoomRef.current) {
      const { room, moved } = dragRoomRef.current;
      dragRoomRef.current = null;
      if (moved && dragOverrides[room.id]) {
        const coords = dragOverrides[room.id];
        await onSaveRoomPosition?.(room.id, coords.pos_x, coords.pos_y, room.floor);
        setToolbarAnnouncement(`已保存 ${room.name} 新坐标 (${coords.pos_x}, ${coords.pos_y})`);
      }
      setDragOverrides((prev) => {
        const next = { ...prev };
        delete next[room.id];
        return next;
      });
    }
    panDragRef.current = null;
  };

  const openRoomModal = (room = null) => {
    setEditingRoom(room);
    if (room) {
      setRoomForm({
        code: room.code || '',
        name: room.name || '',
        floor: room.floor || activeFloor,
        owner_dept_id: String(room.owner_dept_id || currentOperator?.home_dept_id || ''),
        power_capacity_amps: String(room.power_capacity_amps || '32.0000'),
      });
    } else {
      setRoomForm({
        code: `RM-${activeFloor[0]}0${visibleRooms.length + 1}`,
        name: '',
        floor: activeFloor,
        owner_dept_id: String(currentOperator?.home_dept_id || departments[0]?.id || ''),
        power_capacity_amps: '32.0000',
      });
    }
    roomDialogRef.current?.showModal();
  };

  const handleSubmitRoomModal = async (e) => {
    e.preventDefault();
    const ok = await onSaveRoom?.(editingRoom?.id || null, {
      ...roomForm,
      owner_dept_id: roomForm.owner_dept_id ? Number(roomForm.owner_dept_id) : null,
      pos_x: editingRoom ? editingRoom.pos_x : 80 + ((visibleRooms.length * 60) % 680),
      pos_y: editingRoom ? editingRoom.pos_y : 72 + (visibleRooms.length >= 3 ? 395 : 0),
    });
    if (ok) {
      roomDialogRef.current?.close();
    }
  };

  const handleSubmitDiscovery = async (e) => {
    e.preventDefault();
    if (!discoveredDevice) return;
    const ok = await onAssignDiscoveredDevice?.(discoveredDevice.id, {
      code: discoveredDevice.code,
      name: discoverForm.name,
      owner_dept_id: Number(discoverForm.owner_dept_id),
      room_id: discoverForm.room_id ? Number(discoverForm.room_id) : null,
    });
    if (ok) {
      discoveryDialogRef.current?.close();
      onDismissDiscoveredDevice?.();
    }
  };

  return (
    <section aria-label="实验室 1F/2F/3F 数字孪生平面图监控" className="space-y-2.5">
      {/* 顶部视口提示与统计胶囊 */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700">
        <div className="flex flex-wrap items-center gap-2">
          <span>
            点击楼层房间卡片查看设备实时电流、状态与预约；
            {floorplanPolicy?.edit_rooms
              ? '开启「调整位置」后可拖拽保存房间平面图布局'
              : '当前权限处于安全监控浏览层级'}
          </span>
          {!floorplanPolicy?.view_all_depts && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-300 text-amber-800 text-[11px] font-medium">
              <Lock className="w-3 h-3" aria-hidden="true" />
              仅显示归口本科室房间
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-300 text-slate-700">
            本层房间 {visibleRooms.length} 间
          </span>
          <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-300 text-emerald-800">
            在线设备 {devices.filter((d) => d.is_online !== false).length}/{devices.length} 台
          </span>
        </div>
      </div>

      {/* 主数字孪生视口容器 */}
      <div className="twin-canvas-viewport">
        {/* 现代无障碍工具栏 (role="toolbar" + focusgroup) */}
        <div
          ref={toolbarRef}
          role="toolbar"
          focusgroup="toolbar wrap"
          aria-label="楼层与视图控制"
          aria-controls="floorplan-svg"
          className="twin-floating-toolbar"
        >
          <div role="group" aria-label="楼层切换" className="flex items-center gap-1.5">
            {FLOORS.map((fl) => (
              <button
                key={fl.id}
                type="button"
                aria-pressed={activeFloor === fl.id}
                onClick={() => {
                  setActiveFloor(fl.id);
                  setSelectedRoomId(null);
                  setToolbarAnnouncement(`已切换至 ${fl.label}`);
                }}
                className="twin-toolbar-btn"
              >
                <Building2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{fl.label}</span>
              </button>
            ))}
          </div>

          <span role="separator" aria-orientation="vertical" className="twin-toolbar-sep" />

          <div role="group" aria-label="视图与缩放" className="flex flex-wrap items-center gap-1.5">
            {floorplanPolicy?.show_heatmap && (
              <button
                type="button"
                aria-pressed={heatmapMode}
                onClick={() => {
                  const next = !heatmapMode;
                  setHeatmapMode(next);
                  setToolbarAnnouncement(next ? '已开启负荷热力透视' : '已关闭负荷热力透视');
                }}
                className="twin-toolbar-btn twin-toolbar-btn--heat"
              >
                <Flame className="w-3.5 h-3.5" aria-hidden="true" />
                <span>热力透视</span>
              </button>
            )}

            <button
              type="button"
              aria-label="放大视口"
              title="放大视口"
              onClick={() => {
                setZoom((z) => Math.min(1.6, Number((z + 0.15).toFixed(2))));
                setToolbarAnnouncement('已放大平面图');
              }}
              className="twin-toolbar-btn"
            >
              <ZoomIn className="w-3.5 h-3.5" aria-hidden="true" />
              <span>放大</span>
            </button>
            <button
              type="button"
              aria-label="缩小视口"
              title="缩小视口"
              onClick={() => {
                setZoom((z) => Math.max(0.7, Number((z - 0.15).toFixed(2))));
                setToolbarAnnouncement('已缩小平面图');
              }}
              className="twin-toolbar-btn"
            >
              <ZoomOut className="w-3.5 h-3.5" aria-hidden="true" />
              <span>缩小</span>
            </button>
            <button
              type="button"
              aria-label="复位视口"
              title="复位视口"
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
                setToolbarAnnouncement('已复位平面图视角');
              }}
              className="twin-toolbar-btn"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>复位</span>
            </button>

            {floorplanPolicy?.edit_rooms && (isAdmin || isDeptHead) && (
              <>
                <span role="separator" aria-orientation="vertical" className="twin-toolbar-sep" />
                <button
                  type="button"
                  aria-pressed={editMode}
                  onClick={() => {
                    const next = !editMode;
                    setEditMode(next);
                    setToolbarAnnouncement(next ? '已进入房间坐标拖拽调整模式' : '已锁定房间坐标布局');
                  }}
                  className="twin-toolbar-btn twin-toolbar-btn--edit"
                >
                  {editMode ? (
                    <Unlock className="w-3.5 h-3.5" aria-hidden="true" />
                  ) : (
                    <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  <span>调整位置</span>
                </button>
                <button
                  type="button"
                  onClick={() => openRoomModal(null)}
                  className="twin-toolbar-btn"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>新建房间</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* 工具栏屏幕阅读器状态反馈区 */}
        <p role="status" className="visually-hidden">
          {toolbarAnnouncement}
        </p>

        {/* 中央 SVG 蓝图画布 + 右侧滑出房间详情抽屉 */}
        <div className="relative flex flex-col lg:flex-row">
          <div className="flex-1 min-w-0 p-2 sm:p-3 overflow-hidden">
            <svg
              ref={svgRef}
              id="floorplan-svg"
              viewBox="0 0 1200 800"
              role="img"
              aria-labelledby="svg-blueprint-title"
              className="w-full h-[23rem] sm:h-[29rem] select-none touch-pan-y"
              onPointerDown={handleSvgPointerDown}
              onPointerMove={handleSvgPointerMove}
              onPointerUp={handleSvgPointerUp}
              onPointerLeave={handleSvgPointerUp}
            >
              <title id="svg-blueprint-title">
                UniLab-OS {activeFloor} 实验室数字孪生建筑平面图
              </title>
              <defs>
                <pattern id="unilab-grid-pattern" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path
                    d="M 40 0 L 0 0 0 40"
                    fill="none"
                    stroke="rgba(14, 116, 144, 0.1)"
                    strokeWidth="1"
                  />
                  <circle cx="40" cy="40" r="1.2" fill="rgba(2, 132, 199, 0.28)" />
                </pattern>
              </defs>

              <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                <rect x="0" y="0" width="1200" height="800" fill="url(#unilab-grid-pattern)" />

                {/* 建筑外墙与柱网结构层 */}
                <g aria-hidden="true">
                  <rect
                    x="36"
                    y="36"
                    width="1128"
                    height="728"
                    rx="18"
                    fill="rgba(255, 255, 255, 0.56)"
                    stroke="#64748b"
                    strokeWidth="2"
                  />
                  <rect
                    x="44"
                    y="44"
                    width="1112"
                    height="712"
                    rx="14"
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.85)"
                    strokeWidth="1.5"
                  />
                  {[
                    [50, 50], [420, 50], [760, 50], [1134, 50],
                    [50, 340], [1134, 340],
                    [50, 734], [420, 734], [760, 734], [1134, 734],
                  ].map(([cx, cy], idx) => (
                    <rect
                      key={idx}
                      x={cx}
                      y={cy}
                      width="16"
                      height="16"
                      rx="3"
                      fill="#0284c7"
                      fillOpacity="0.35"
                    />
                  ))}

                  {/* 中央主走廊 */}
                  <rect
                    x="56"
                    y="336"
                    width="1088"
                    height="96"
                    rx="10"
                    fill="rgba(224, 242, 254, 0.52)"
                    stroke="#0284c7"
                    strokeOpacity="0.4"
                    strokeWidth="1.4"
                    strokeDasharray="8 6"
                  />
                  <text
                    x="600"
                    y="390"
                    fill="#0369a1"
                    fontSize="12"
                    fontWeight="700"
                    letterSpacing="4"
                    textAnchor="middle"
                  >
                    {activeFloor} 实验主动线中央走廊 (Central Corridor)
                  </text>

                  {/* 电梯 & 消防梯 & 公共设施 */}
                  <g transform="translate(440, 342)">
                    <rect width="130" height="84" rx="8" fill="#ffffff" fillOpacity="0.88" stroke="#94a3b8" />
                    <text x="65" y="36" fill="#92400e" fontSize="12" fontWeight="700" textAnchor="middle">
                      智能客梯
                    </text>
                    <text x="65" y="56" fill="#475569" fontSize="10" textAnchor="middle">
                      ELEVATOR 1-2
                    </text>
                  </g>
                  <g transform="translate(630, 342)">
                    <rect width="130" height="84" rx="8" fill="#ffffff" fillOpacity="0.88" stroke="#94a3b8" />
                    <text x="65" y="36" fill="#065f46" fontSize="12" fontWeight="700" textAnchor="middle">
                      消防疏散梯
                    </text>
                    <text x="65" y="56" fill="#475569" fontSize="10" textAnchor="middle">
                      FIRE STAIRS
                    </text>
                  </g>
                  <g transform="translate(60, 480)">
                    <rect width="130" height="110" rx="10" fill="#ffffff" fillOpacity="0.8" stroke="#94a3b8" />
                    <text x="65" y="50" fill="#334155" fontSize="12" fontWeight="600" textAnchor="middle">
                      公共卫生间
                    </text>
                    <text x="65" y="70" fill="#64748b" fontSize="10" textAnchor="middle">
                      RESTROOM
                    </text>
                  </g>
                  <g transform="translate(1010, 480)">
                    <rect width="130" height="110" rx="10" fill="#fef3c7" fillOpacity="0.85" stroke="#d97706" />
                    <text x="65" y="50" fill="#92400e" fontSize="12" fontWeight="700" textAnchor="middle">
                      强电配电室
                    </text>
                    <text x="65" y="70" fill="#78350f" fontSize="10" textAnchor="middle">
                      UPS POWER
                    </text>
                  </g>
                  <g transform="translate(480, 640)">
                    <rect width="240" height="110" rx="10" fill="#ffffff" fillOpacity="0.9" stroke="#0284c7" strokeWidth="1.5" />
                    <line x1="20" y1="48" x2="220" y2="48" stroke="#d97706" strokeWidth="2" strokeDasharray="6 4" />
                    <text x="120" y="32" fill="#0369a1" fontSize="12.5" fontWeight="700" textAnchor="middle">
                      实验大楼 RFID 门禁主大堂
                    </text>
                    <text x="120" y="76" fill="#334155" fontSize="11" textAnchor="middle">
                      智能安防闸机入口 (Main Lobby)
                    </text>
                  </g>
                </g>

                {/* 动态房间孪生块（锁定态与编辑态均严格读取保存坐标） */}
                {visibleRooms.map((room) => {
                  const stats = roomStatsMap[room.id] || {
                    devices: [],
                    totalCurrent: 0,
                    loadRatio: 0,
                    hasFault: false,
                    hasRunning: false,
                  };
                  const posX = dragOverrides[room.id]?.pos_x ?? room.pos_x;
                  const posY = dragOverrides[room.id]?.pos_y ?? room.pos_y;
                  const isSelected = selectedRoomId === room.id;

                  const statusClass = stats.hasFault
                    ? 'status-alarm'
                    : stats.hasRunning
                      ? 'status-running'
                      : 'status-normal';
                  const statusText = stats.hasFault
                    ? '▲ 故障告警'
                    : stats.hasRunning
                      ? '● 运行中'
                      : '○ 待机就绪';
                  const pillFill = stats.hasFault
                    ? '#fee2e2'
                    : stats.hasRunning
                      ? '#d1fae5'
                      : '#e0f2fe';
                  const pillColor = stats.hasFault
                    ? '#b91c1c'
                    : stats.hasRunning
                      ? '#047857'
                      : '#0369a1';

                  const heatColor =
                    heatmapMode && floorplanPolicy?.show_heatmap
                      ? stats.loadRatio > 0.6
                        ? 'rgba(239, 68, 68, 0.26)'
                        : stats.loadRatio > 0.15
                          ? 'rgba(245, 158, 11, 0.22)'
                          : 'rgba(16, 185, 129, 0.14)'
                      : null;

                  return (
                    <g
                      key={room.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`${room.name}，${statusText}，包含 ${stats.devices.length} 台设备`}
                      className={`svg-lab-group ${statusClass} ${isSelected ? 'is-selected' : ''} ${
                        editMode && canManageRoom(room) ? 'in-edit-mode' : ''
                      }`}
                      transform={`translate(${posX}, ${posY})`}
                      onPointerDown={(e) => handleRoomPointerDown(e, room)}
                      onClick={() => {
                        if (!editMode) setSelectedRoomId(room.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setSelectedRoomId(room.id);
                        if (e.key === ' ') e.preventDefault();
                      }}
                      onKeyUp={(e) => {
                        if (e.key === ' ') setSelectedRoomId(room.id);
                      }}
                    >
                      <rect
                        width={room.width}
                        height={room.height}
                        rx="12"
                        className="svg-zone-rect"
                      />
                      {heatColor && (
                        <rect
                          x="2"
                          y="2"
                          width={room.width - 4}
                          height={room.height - 4}
                          rx="10"
                          fill={heatColor}
                          pointerEvents="none"
                        />
                      )}

                      {/* 房间标题与编码 */}
                      <text
                        x="14"
                        y="24"
                        fill="#0369a1"
                        fontSize="11"
                        fontWeight="700"
                        fontFamily="monospace"
                        pointerEvents="none"
                      >
                        {room.code} · {room.owner_dept_name}
                      </text>
                      <text
                        x="14"
                        y="46"
                        fill="#0f172a"
                        fontSize="14.5"
                        fontWeight="700"
                        pointerEvents="none"
                      >
                        {room.name}
                      </text>

                      {/* 状态胶囊 + 实时电流 */}
                      <rect
                        x="14"
                        y="58"
                        width="92"
                        height="22"
                        rx="11"
                        fill={pillFill}
                        stroke={pillColor}
                        strokeOpacity="0.45"
                        pointerEvents="none"
                      />
                      <text
                        x="60"
                        y="73"
                        fill={pillColor}
                        fontSize="11"
                        fontWeight="700"
                        textAnchor="middle"
                        pointerEvents="none"
                      >
                        {statusText}
                      </text>

                      {floorplanPolicy?.show_telemetry && (
                        <text
                          x={room.width - 14}
                          y="73"
                          fill="#0f172a"
                          fontSize="12"
                          fontWeight="700"
                          fontFamily="monospace"
                          textAnchor="end"
                          pointerEvents="none"
                        >
                          {stats.totalCurrent.toFixed(2)} A
                        </text>
                      )}

                      {/* 房间内设备微缩列表（最多展示前3台） */}
                      {stats.devices.slice(0, 3).map((d, idx) => {
                        const rowY = 92 + idx * 32;
                        const chipStroke =
                          d.status === 'FAULT'
                            ? '#dc2626'
                            : ['RUNNING', 'OVERTIME_RUNNING'].includes(d.status)
                              ? '#059669'
                              : d.status === 'RESERVED'
                                ? '#d97706'
                                : '#94a3b8';
                        return (
                          <g key={d.id} transform={`translate(14, ${rowY})`} pointerEvents="none">
                            <rect
                              width={room.width - 28}
                              height="26"
                              rx="6"
                              fill="#ffffff"
                              fillOpacity="0.92"
                              stroke={chipStroke}
                              strokeWidth="1.2"
                            />
                            <text
                              x="8"
                              y="17"
                              fill="#0f172a"
                              fontSize="11"
                              fontWeight="600"
                              fontFamily="monospace"
                            >
                              [{d.code}] {d.name.slice(0, 12)}
                            </text>
                            {floorplanPolicy?.show_telemetry && (
                              <text
                                x={room.width - 36}
                                y="17"
                                fill={chipStroke === '#94a3b8' ? '#334155' : chipStroke}
                                fontSize="11"
                                fontWeight="700"
                                fontFamily="monospace"
                                textAnchor="end"
                              >
                                {Number(d.current_amps).toFixed(2)}A
                              </text>
                            )}
                          </g>
                        );
                      })}
                      {stats.devices.length > 3 && (
                        <text
                          x="14"
                          y={room.height - 10}
                          fill="#475569"
                          fontSize="11"
                          pointerEvents="none"
                        >
                          +{stats.devices.length - 3} 台设备（点击查看全部）
                        </text>
                      )}
                      {stats.devices.length === 0 && (
                        <text
                          x="14"
                          y="116"
                          fill="#64748b"
                          fontSize="11.5"
                          pointerEvents="none"
                        >
                          暂无物理仪器挂载（点击房间可分配）
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>

          {/* 右侧非模态房间详情抽屉：不阻断继续点击地图切换其他房间 */}
          {selectedRoom && (
            <aside
              aria-label={`${selectedRoom.name} 设备控制与监控详情`}
              className="w-full lg:w-96 shrink-0 border-t lg:border-t-0 lg:border-l border-slate-300 bg-white/95 p-4 flex flex-col gap-3 max-h-[34rem] overflow-y-auto custom-scrollbar"
            >
              <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-2.5">
                <div>
                  <div className="font-mono text-[11px] font-bold text-blue-700">
                    {selectedRoom.code} · {selectedRoom.floor} · {selectedRoom.owner_dept_name}
                  </div>
                  <h2 className="text-sm font-bold text-slate-900">{selectedRoom.name}</h2>
                  <p className="text-[11px] text-slate-500">
                    挂载设备 {(roomStatsMap[selectedRoom.id]?.devices || []).length} 台
                    {floorplanPolicy?.show_telemetry &&
                      ` · 实时总负荷 ${(roomStatsMap[selectedRoom.id]?.totalCurrent || 0).toFixed(2)} A / 上限 ${Number(
                        selectedRoom.power_capacity_amps || 32
                      ).toFixed(1)} A`}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="关闭房间详情抽屉"
                  onClick={() => setSelectedRoomId(null)}
                  className="p-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

              {canManageRoom(selectedRoom) && (
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => openRoomModal(selectedRoom)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 bg-slate-50 hover:bg-blue-50 text-xs font-medium text-slate-700"
                  >
                    <Pencil className="w-3 h-3" aria-hidden="true" />
                    配置房间属性
                  </button>
                  {selectedRoom.code !== 'UNASSIGNED' && (
                    <button
                      type="button"
                      onClick={() =>
                        onRequestConfirm?.({
                          title: `删除房间 ${selectedRoom.name}`,
                          message: '删除房间不会销毁仪器资产，原房间下设备将退回「未分配」状态。确认删除？',
                          confirmText: '确认删除房间',
                          tone: 'danger',
                          onConfirm: async () => {
                            const ok = await onDeleteRoom?.(selectedRoom.id);
                            if (ok) setSelectedRoomId(null);
                          },
                        })
                      }
                      className="px-2.5 py-1 rounded-lg border border-rose-300 bg-rose-50 hover:bg-rose-100 text-xs font-medium text-rose-800"
                    >
                      删除房间
                    </button>
                  )}
                </div>
              )}

              {(roomStatsMap[selectedRoom.id]?.devices || []).length === 0 ? (
                <div className="p-5 text-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-500">
                  该房间当前未挂载任何仪器设备
                </div>
              ) : (
                <div className="space-y-2.5">
                  {(roomStatsMap[selectedRoom.id]?.devices || []).map((dev) => (
                    <div
                      key={dev.id}
                      className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[11px] font-bold text-blue-700">
                              [{dev.code}]
                            </span>
                            {dev.is_online !== false ? (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-700">
                                <Wifi className="w-3 h-3" aria-hidden="true" />
                                在线
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-slate-500">
                                <WifiOff className="w-3 h-3" aria-hidden="true" />
                                离线
                              </span>
                            )}
                          </div>
                          <div className="font-bold text-xs text-slate-900 truncate mt-0.5">
                            {dev.name}
                          </div>
                        </div>
                        <StatusBadge status={dev.status} />
                      </div>

                      {floorplanPolicy?.show_telemetry && (
                        <div className="grid grid-cols-2 gap-2 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 font-mono text-[11px] tabular-nums">
                          <div>
                            <span className="text-slate-500">采样电流: </span>
                            <strong className="text-blue-700">{dev.current_amps} A</strong>
                          </div>
                          <div>
                            <span className="text-slate-500">采样电压: </span>
                            <strong className="text-slate-800">{dev.voltage || '220.0000'} V</strong>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-1.5 pt-0.5">
                        <button
                          type="button"
                          onClick={() => onOpenDeviceDetail(dev.id)}
                          className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold"
                        >
                          查看详情与预约
                        </button>

                        {canControlDevice(dev) && (
                          <div className="flex items-center gap-1" role="group" aria-label={`切换 ${dev.code} 运行状态`}>
                            <button
                              type="button"
                              onClick={() => onSwitchDeviceStatus?.(dev.id, 'IDLE')}
                              className={`px-2 py-1 rounded-md border text-[11px] font-medium ${
                                dev.status === 'IDLE'
                                  ? 'bg-slate-800 text-white border-slate-800'
                                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                              }`}
                            >
                              待机
                            </button>
                            <button
                              type="button"
                              onClick={() => onSwitchDeviceStatus?.(dev.id, 'RUNNING')}
                              className={`px-2 py-1 rounded-md border text-[11px] font-medium ${
                                ['RUNNING', 'OVERTIME_RUNNING'].includes(dev.status)
                                  ? 'bg-emerald-700 text-white border-emerald-700'
                                  : 'bg-white text-emerald-800 border-emerald-300 hover:bg-emerald-50'
                              }`}
                            >
                              运行
                            </button>
                            <button
                              type="button"
                              onClick={() => onSwitchDeviceStatus?.(dev.id, 'FAULT')}
                              className={`px-2 py-1 rounded-md border text-[11px] font-medium ${
                                dev.status === 'FAULT'
                                  ? 'bg-rose-700 text-white border-rose-700'
                                  : 'bg-white text-rose-800 border-rose-300 hover:bg-rose-50'
                              }`}
                            >
                              故障
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </aside>
          )}
        </div>

        {/* 底部负荷分布进度条与房间快选 Dock */}
        <div className="twin-bottom-dock">
          {floorplanPolicy?.show_telemetry && visibleRooms.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {visibleRooms.map((r) => {
                const st = roomStatsMap[r.id] || { totalCurrent: 0, loadRatio: 0 };
                const cap = Number(r.power_capacity_amps || 32);
                const pct = Math.round(st.loadRatio * 100);
                return (
                  <div
                    key={r.id}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50/70 space-y-1"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-slate-800 truncate">{r.name}</span>
                      <span className="font-mono text-slate-600 tabular-nums shrink-0">
                        {st.totalCurrent.toFixed(2)}/{cap.toFixed(0)}A ({pct}%)
                      </span>
                    </div>
                    <progress
                      value={st.totalCurrent}
                      max={cap}
                      aria-label={`${r.name} 实时负荷 ${pct}%`}
                      className="w-full h-1.5 rounded overflow-hidden accent-blue-600"
                    />
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            {visibleRooms.map((r) => {
              const st = roomStatsMap[r.id] || { devices: [], hasFault: false, hasRunning: false };
              const Icon = st.hasFault ? AlertTriangle : st.hasRunning ? Activity : CheckCircle2;
              const active = selectedRoomId === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedRoomId(active ? null : r.id)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition ${
                    active
                      ? 'bg-blue-600 text-white border-blue-700'
                      : st.hasFault
                        ? 'bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100'
                        : st.hasRunning
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>{r.name}</span>
                  <span className="font-mono text-[10px] opacity-80">({st.devices.length})</span>
                </button>
              );
            })}
            {unassignedDevices.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-300 text-amber-800 text-[11px]">
                <Cpu className="w-3 h-3" aria-hidden="true" />
                未归房设备 {unassignedDevices.length} 台
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 原生 <dialog>：新建或修改实验房间 */}
      <dialog
        ref={roomDialogRef}
        aria-labelledby="room-dialog-title"
        className="app-dialog w-full p-0"
      >
        <form onSubmit={handleSubmitRoomModal} className="p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
            <h2 id="room-dialog-title" className="font-bold text-sm text-slate-900">
              {editingRoom ? `修改房间属性 (${editingRoom.code})` : '新建数字孪生实验房间'}
            </h2>
            <button
              type="button"
              aria-label="关闭房间配置弹窗"
              onClick={() => roomDialogRef.current?.close()}
              className="p-1 rounded-lg text-slate-500 hover:bg-slate-100"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="房间编码" required>
              {(props) => (
                <input
                  {...props}
                  type="text"
                  autoFocus
                  value={roomForm.code}
                  onChange={(e) => setRoomForm({ ...roomForm, code: e.target.value })}
                  className={`${INPUT_CLS} font-mono`}
                  required
                />
              )}
            </FormField>
            <FormField label="所属楼层" required>
              {(props) => (
                <select
                  {...props}
                  value={roomForm.floor}
                  onChange={(e) => setRoomForm({ ...roomForm, floor: e.target.value })}
                  className={INPUT_CLS}
                >
                  <option value="1F">1F</option>
                  <option value="2F">2F</option>
                  <option value="3F">3F</option>
                </select>
              )}
            </FormField>
            <FormField label="房间名称" required className="sm:col-span-2">
              {(props) => (
                <input
                  {...props}
                  type="text"
                  value={roomForm.name}
                  onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })}
                  placeholder="例如：104 低温超导测试室"
                  className={INPUT_CLS}
                  required
                />
              )}
            </FormField>
            <FormField label="归口行政科室">
              {(props) => (
                <select
                  {...props}
                  value={roomForm.owner_dept_id}
                  disabled={!isAdmin}
                  onChange={(e) => setRoomForm({ ...roomForm, owner_dept_id: e.target.value })}
                  className={INPUT_CLS}
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
            <FormField label="额定电力容量 (A)" required>
              {(props) => (
                <input
                  {...props}
                  type="number"
                  step="0.5"
                  min="5"
                  value={roomForm.power_capacity_amps}
                  onChange={(e) =>
                    setRoomForm({ ...roomForm, power_capacity_amps: e.target.value })
                  }
                  className={`${INPUT_CLS} font-mono`}
                  required
                />
              )}
            </FormField>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => roomDialogRef.current?.close()}
              className="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-medium hover:bg-slate-50"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm"
            >
              保存房间配置
            </button>
          </div>
        </form>
      </dialog>

      {/* 原生 <dialog>：ESP32 未知物理节点自动发现纳管向导 */}
      <dialog
        ref={discoveryDialogRef}
        aria-labelledby="discovery-dialog-title"
        className="app-dialog w-full p-0"
      >
        <form onSubmit={handleSubmitDiscovery} className="p-5 space-y-4">
          <div className="flex items-start gap-2.5 border-b border-slate-200 pb-2.5">
            <Radio className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1">
              <h2 id="discovery-dialog-title" className="font-bold text-sm text-slate-900">
                发现新接入 ESP32 物联网传感器节点
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                硬件编码 <code className="font-mono font-bold text-blue-700">{discoveredDevice?.code}</code>{' '}
                已主动上报遥测（{discoveredDevice?.current_amps}A / {discoveredDevice?.voltage}V），请分配名称与房间。
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <FormField label="设备正式名称" required>
              {(props) => (
                <input
                  {...props}
                  type="text"
                  autoFocus
                  value={discoverForm.name}
                  onChange={(e) => setDiscoverForm({ ...discoverForm, name: e.target.value })}
                  className={INPUT_CLS}
                  required
                />
              )}
            </FormField>
            <FormField label="归口行政科室" required>
              {(props) => (
                <select
                  {...props}
                  value={discoverForm.owner_dept_id}
                  onChange={(e) => setDiscoverForm({ ...discoverForm, owner_dept_id: e.target.value })}
                  className={INPUT_CLS}
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
            <FormField label="挂载物理实验室房间">
              {(props) => (
                <select
                  {...props}
                  value={discoverForm.room_id}
                  onChange={(e) => setDiscoverForm({ ...discoverForm, room_id: e.target.value })}
                  className={INPUT_CLS}
                >
                  <option value="">暂不绑定房间</option>
                  {rooms
                    .filter((r) => r.code !== 'UNASSIGNED')
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        [{r.floor}] {r.name}
                      </option>
                    ))}
                </select>
              )}
            </FormField>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                discoveryDialogRef.current?.close();
                onDismissDiscoveredDevice?.();
              }}
              className="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-medium hover:bg-slate-50"
            >
              稍后在平面图分配
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm"
            >
              确认纳管并绑定房间
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
