import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';



const LOGO_URL = "/assets/logo.jpg";


// --- Constants & Config ---
const SHEET_ID = '1GAg6TPB2U7URfTZnEz05IRaAXYrzTFDBFgspOTCLf4Q';
const SHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`;

const DAYS_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const DAY_LABELS: Record<string, string> = {
  'Mon': 'Thứ 2',
  'Tue': 'Thứ 3',
  'Wed': 'Thứ 4',
  'Thu': 'Thứ 5',
  'Fri': 'Thứ 6',
  'Sat': 'Thứ 7',
  'Sun': 'Chủ Nhật'
};

const SHIFTS = [1, 2, 3];

const SHIFT_TIMES: Record<number, string> = {
  1: '07:00 - 12:30',
  2: '12:30 - 17:30',
  3: '17:30 - 22:30'
};

// --- Default Roster ---
const DEFAULT_EMPLOYEES = [
  { id: 'NV001', name: 'Bùi Đức Huy' },
  { id: 'NV002', name: 'Tạ Lê Uyên' },
  { id: 'NV003', name: 'Cung Hồng Ngân Hà' },
  { id: 'NV004', name: 'Nguyễn Phương Thảo' },
  { id: 'NV005', name: 'Trần Vũ Phương Oanh' },
  { id: 'NV006', name: 'Nguyễn Minh Nguyệt' },
  { id: 'NV007', name: 'Đinh Diệu An' },
  { id: 'NV008', name: 'Nguyễn Văn Toàn' }
];

// --- Helper: Color Generator for Staff ---
const getStaffColor = (name: string) => {
  const colors = [
    { bg: '#e3f2fd', border: '#64b5f6', text: '#0d47a1' }, // Blue
    { bg: '#e8f5e9', border: '#81c784', text: '#1b5e20' }, // Green
    { bg: '#fff3e0', border: '#ffb74d', text: '#e65100' }, // Orange
    { bg: '#f3e5f5', border: '#ba68c8', text: '#4a148c' }, // Purple
    { bg: '#e0f7fa', border: '#4dd0e1', text: '#006064' }, // Cyan
    { bg: '#ffebee', border: '#e57373', text: '#b71c1c' }, // Red
    { bg: '#f9fbe7', border: '#dce775', text: '#827717' }, // Lime
    { bg: '#fff8e1', border: '#ffd54f', text: '#ff6f00' }, // Amber
    { bg: '#eceff1', border: '#90a4ae', text: '#263238' }, // Grey
    { bg: '#fce4ec', border: '#f06292', text: '#880e4f' }  // Pink
  ];
  
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const index = Math.abs(hash) % colors.length;
  return colors[index];
};

// --- Helper: Date Utils (Next Week Logic) ---
const getNextWeekDates = () => {
  const curr = new Date();
  const currentDay = curr.getDay(); // 0 (Sun) to 6 (Sat)
  
  const distanceToThisMonday = currentDay === 0 ? 6 : currentDay - 1;
  
  const thisMonday = new Date(curr);
  thisMonday.setDate(curr.getDate() - distanceToThisMonday);

  // Get NEXT Monday
  const nextMonday = new Date(thisMonday);
  nextMonday.setDate(thisMonday.getDate() + 7);

  const dates: Record<string, { dateStr: string, isToday: boolean, isWeekend: boolean }> = {};
  
  DAYS_ORDER.forEach((dayCode, index) => {
    const d = new Date(nextMonday);
    d.setDate(nextMonday.getDate() + index);
    
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    
    dates[dayCode] = {
      dateStr: `${day}/${month}`,
      isToday: false,
      isWeekend: dayCode === 'Sat' || dayCode === 'Sun'
    };
  });

  return dates;
};

// --- Helper: CSV Parser ---
const parseCSV = (text: string) => {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        i++; 
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (currentCell || currentRow.length > 0) {
        currentRow.push(currentCell);
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
      }
      if (char === '\r' && nextChar === '\n') i++;
    } else {
      currentCell += char;
    }
  }
  if (currentCell || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }
  return rows;
};

// --- Helper: Normalize Data ---
const normalizeSheetData = (rows: string[][]) => {
  if (rows.length < 2) return [];

  const headers = rows[0].map(h => h.toLowerCase().trim());
  const nameIdx = headers.findIndex(h => h.includes('tên') || h.includes('name'));
  const reasonIdx = headers.findIndex(h => h.includes('lý do') || h.includes('reason') || h.includes('note'));

  const dayMapping: Record<string, number> = {};
  const dayKeywords: Record<string, string[]> = {
    'Mon': ['thứ 2', 't2', 'mon'],
    'Tue': ['thứ 3', 't3', 'tue'],
    'Wed': ['thứ 4', 't4', 'wed'],
    'Thu': ['thứ 5', 't5', 'thu'],
    'Fri': ['thứ 6', 't6', 'fri'],
    'Sat': ['thứ 7', 't7', 'sat'],
    'Sun': ['chủ nhật', 'cn', 'sun']
  };

  Object.entries(dayKeywords).forEach(([dayCode, keywords]) => {
    const idx = headers.findIndex(h => keywords.some(k => h.includes(k)));
    if (idx !== -1) dayMapping[dayCode] = idx;
  });

  const singleShiftColIdx = headers.findIndex(h => 
    (h.includes('ca') || h.includes('lịch') || h.includes('đăng ký') || h.includes('shift')) 
    && !Object.values(dayMapping).includes(headers.indexOf(h))
  );

  if (nameIdx === -1) return [];

  return rows.slice(1).map(row => {
    const name = row[nameIdx]?.trim();
    if (!name) return null;

    const parsedSlots: string[] = [];

    if (Object.keys(dayMapping).length > 0) {
      Object.entries(dayMapping).forEach(([day, idx]) => {
        const cellContent = row[idx]?.toLowerCase() || '';
        if (!cellContent) return;
        if (cellContent.includes('ca 1') || cellContent.includes('sáng') || cellContent.includes('morning')) parsedSlots.push(`${day}-1`);
        if (cellContent.includes('ca 2') || cellContent.includes('chiều') || cellContent.includes('afternoon')) parsedSlots.push(`${day}-2`);
        if (cellContent.includes('ca 3') || cellContent.includes('tối') || cellContent.includes('evening')) parsedSlots.push(`${day}-3`);
      });
    } 
    else if (singleShiftColIdx !== -1) {
      const rawSlots = row[singleShiftColIdx] || '';
      const parts = rawSlots.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
      parts.forEach(part => {
        const lower = part.toLowerCase();
        let day = '';
        let shift = 0;
        if (lower.includes('thứ 2') || lower.includes('t2')) day = 'Mon';
        else if (lower.includes('thứ 3') || lower.includes('t3')) day = 'Tue';
        else if (lower.includes('thứ 4') || lower.includes('t4')) day = 'Wed';
        else if (lower.includes('thứ 5') || lower.includes('t5')) day = 'Thu';
        else if (lower.includes('thứ 6') || lower.includes('t6')) day = 'Fri';
        else if (lower.includes('thứ 7') || lower.includes('t7')) day = 'Sat';
        else if (lower.includes('chủ nhật') || lower.includes('cn')) day = 'Sun';

        if (lower.includes('ca 1') || lower.includes('sáng')) shift = 1;
        else if (lower.includes('ca 2') || lower.includes('chiều')) shift = 2;
        else if (lower.includes('ca 3') || lower.includes('tối')) shift = 3;

        if (day && shift) parsedSlots.push(`${day}-${shift}`);
      });
    }

    return {
      name: name,
      slots: parsedSlots, // e.g., ['Mon-1', 'Mon-2']
      reason: reasonIdx !== -1 ? row[reasonIdx]?.trim() : ''
    };
  }).filter(Boolean) as { name: string, slots: string[], reason: string }[];
};

type ScheduleType = Record<string, Record<number, string[]>>;
type HistoryDataType = Record<string, ScheduleType>; // Key: Week Range string

type Registration = {
  slots: string[];
  reason: string;
};

// --- Login Component ---
const LoginScreen = ({ onLogin }: { onLogin: (u: string, p: string) => void }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username === 'Admin_Giao' && password === 'giaoduyen1') {
      onLogin(username, password);
    } else {
      setError('Sai tên đăng nhập hoặc mật khẩu');
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <img 
          src={LOGO_URL} 
          alt="Giao Cafe Logo" 
          className="app-logo"
        />
        <h2 style={{color: '#c05640', fontFamily: 'serif', marginBottom: '10px'}}>Đăng Nhập Quản Trị</h2>
        <p style={{color:'#6b5f53', marginBottom: '30px', fontSize: '0.9rem'}}>Vui lòng đăng nhập để truy cập hệ thống xếp lịch</p>
        <form onSubmit={handleSubmit}>
          <input 
            type="text" 
            className="login-input" 
            placeholder="Tên đăng nhập" 
            value={username} 
            onChange={e => {setUsername(e.target.value); setError('');}}
          />
          <input 
            type="password" 
            className="login-input" 
            placeholder="Mật khẩu"
            value={password} 
            onChange={e => {setPassword(e.target.value); setError('');}} 
          />
          {error && <div style={{color: '#dc2626', marginBottom: '15px', fontSize:'0.9rem', fontWeight: '600'}}>⚠️ {error}</div>}
          <button type="submit" className="btn-generate" style={{width: '100%', marginTop: '10px'}}>Đăng Nhập</button>
        </form>
      </div>
    </div>
  );
};

// --- Main Dashboard Component ---
const Dashboard = ({ onLogout }: { onLogout: () => void }) => {
  const [registrations, setRegistrations] = useState<Record<string, Registration>>({});
  const [dynamicEmployeeList, setDynamicEmployeeList] = useState(DEFAULT_EMPLOYEES);

  const weekDates = useMemo(() => getNextWeekDates(), []);
  const currentWeekKey = `${weekDates['Mon'].dateStr} - ${weekDates['Sun'].dateStr}`;

  // 1. Lịch sử đã lưu trong localStorage
  const [history, setHistory] = useState<HistoryDataType>({});
  // 2. Lịch tuần hiện tại
  const [finalSchedule, setFinalSchedule] = useState<ScheduleType | null>(null);

  const [showStaffDetails, setShowStaffDetails] = useState(false);
  const [showAssignedStats, setShowAssignedStats] = useState(false);
  const [selectedStaffDetail, setSelectedStaffDetail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Load history + tuần hiện tại từ localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('GIAO_ROSTER_HISTORY_V2');
      if (stored) {
        const parsed: HistoryDataType = JSON.parse(stored);
        setHistory(parsed);
        if (parsed[currentWeekKey]) {
          setFinalSchedule(parsed[currentWeekKey]);
        }
      }
    } catch (e) {
      console.error('Failed to load history from localStorage', e);
    }
  }, [currentWeekKey]);

  const isCurrentWeekSaved = !!history[currentWeekKey];

  // Load đăng ký từ Google Sheet
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const cacheBuster = new Date().getTime();
      const response = await fetch(`${SHEET_CSV_URL}&t=${cacheBuster}`);
      if (!response.ok) throw new Error('Failed to fetch sheet data');
      const text = await response.text();
      const rows = parseCSV(text);
      const data = normalizeSheetData(rows);
      const regRecord: Record<string, Registration> = {};
      const foundNames = new Set<string>();

      data.forEach(item => {
        if (regRecord[item.name]) {
          const existingSlots = new Set(regRecord[item.name].slots);
          item.slots.forEach(s => existingSlots.add(s));

          const currentReason = regRecord[item.name].reason;
          const newReason = item.reason;
          let mergedReason = currentReason;
          if (newReason && !currentReason.includes(newReason)) {
            mergedReason = currentReason ? `${currentReason} | ${newReason}` : newReason;
          }

          regRecord[item.name] = {
            slots: Array.from(existingSlots),
            reason: mergedReason
          };
        } else {
          regRecord[item.name] = {
            slots: item.slots,
            reason: item.reason
          };
        }
        foundNames.add(item.name);
      });

      const newEmployeeList = [...DEFAULT_EMPLOYEES];
      foundNames.forEach(name => {
        if (!newEmployeeList.find(e => e.name === name)) {
          newEmployeeList.push({ id: `NEW_${name}`, name });
        }
      });

      setDynamicEmployeeList(newEmployeeList);
      setRegistrations(regRecord);
      setLastUpdated(new Date());
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Thống kê đăng ký
  const stats = useMemo(() => {
    const totalStaff = dynamicEmployeeList.length;
    const registeredCount = Object.keys(registrations).length;

    const staffDetails = dynamicEmployeeList.map(emp => {
      const reg = registrations[emp.name];
      if (!reg) {
        return {
          ...emp,
          status: 'not-registered',
          count: 0,          totalSlots: 0,
          slots: [] as string[],
          reason: 'Chưa điền form đăng ký',
          isLowRegistration: false
        };
      }

      const uniqueDays = new Set(reg.slots.map((s: string) => s.split('-')[0])).size;
      const isLowRegistration = uniqueDays < 4;

      return {
        ...emp,
        status: 'registered',
        count: uniqueDays,
        totalSlots: reg.slots.length,
        slots: reg.slots,
        isLowRegistration,
        reason: reg.reason || (isLowRegistration ? 'Chưa điền lý do' : '')
      };
    });

    staffDetails.sort((a, b) => {
      if (a.isLowRegistration && !b.isLowRegistration) return -1;
      if (!a.isLowRegistration && b.isLowRegistration) return 1;
      if (a.status === 'not-registered' && b.status === 'registered') return 1;
      if (a.status === 'registered' && b.status === 'not-registered') return -1;
      return 0;
    });

    return { totalStaff, registeredCount, staffDetails };
  }, [registrations, dynamicEmployeeList]);

  const calculateShiftCounts = (schedule: ScheduleType | null, list: { name: string }[]) => {
    const counts: Record<string, number> = {};
    list.forEach(e => (counts[e.name] = 0));
    if (!schedule) return counts;

    DAYS_ORDER.forEach(day => {
      SHIFTS.forEach(shift => {
        (schedule[day]?.[shift] || []).forEach(name => {
          counts[name] = (counts[name] || 0) + 1;
        });
      });
    });
    return counts;
  };

  const assignedStats = useMemo(() => {
    const currentCounts = calculateShiftCounts(finalSchedule, dynamicEmployeeList);

    const otherWeeksHistory = { ...history };
    delete otherWeeksHistory[currentWeekKey];

    const historicalCounts: Record<string, number> = {};
    dynamicEmployeeList.forEach(e => (historicalCounts[e.name] = 0));

    Object.values(otherWeeksHistory).forEach(pastSchedule => {
      const weekCounts = calculateShiftCounts(pastSchedule, dynamicEmployeeList);
      Object.entries(weekCounts).forEach(([name, count]) => {
        historicalCounts[name] = (historicalCounts[name] || 0) + count;
      });
    });

    return dynamicEmployeeList
      .map(emp => {
        const current = currentCounts[emp.name] || 0;
        const past = historicalCounts[emp.name] || 0;
        const total = current + past;
        return { name: emp.name, current, total };
      })
      .sort((a, b) => b.total - a.total);
  }, [finalSchedule, dynamicEmployeeList, history, currentWeekKey]);

  // Thuật toán xếp ca
  const handleGenerate = () => {
    if (isCurrentWeekSaved) return;

    const MAX_PER_SHIFT = 2;
    const newSchedule: ScheduleType = {};

    DAYS_ORDER.forEach(day => {
      newSchedule[day] = { 1: [], 2: [], 3: [] };
    });

    const assignedCounts: Record<string, number> = {};
    dynamicEmployeeList.forEach(emp => (assignedCounts[emp.name] = 0));

    DAYS_ORDER.forEach(day => {
      SHIFTS.forEach(shift => {
        const registeredForSlot = Object.entries(registrations)
          .filter(([_, data]: [string, Registration]) => data.slots.includes(`${day}-${shift}`))
          .map(([name]) => name);

        const validCandidates = registeredForSlot.filter(name => {
          if (shift === 3) {
            const hasShift1 = newSchedule[day][1].includes(name);
            const hasShift2 = newSchedule[day][2].includes(name);
            if (hasShift1 && !hasShift2) {
              return false;
            }
          }
          return true;
        });

        validCandidates.sort((a, b) => {
          const countA = assignedCounts[a] || 0;
          const countB = assignedCounts[b] || 0;
          if (countA !== countB) return countA - countB;
          return Math.random() - 0.5;
        });

        const selected = validCandidates.slice(0, MAX_PER_SHIFT);
        newSchedule[day][shift] = selected;
        selected.forEach(name => {
          assignedCounts[name] = (assignedCounts[name] || 0) + 1;
        });
      });
    });

    setFinalSchedule(newSchedule);
    setShowStaffDetails(false);
  };

  const handleSaveWeek = () => {
    if (!finalSchedule) return;
    if (isCurrentWeekSaved) return;

    const confirmed = window.confirm(
      `⚠️ XÁC NHẬN LƯU KẾT QUẢ\n\nBạn có chắc chắn muốn lưu lịch của tuần [${currentWeekKey}]?\n\n❗️ LƯU Ý: Sau khi lưu, bạn sẽ KHÔNG THỂ xếp lại lịch cho tuần này nữa. Dữ liệu sẽ được chốt để tính tổng tích lũy.`
    );
    if (!confirmed) return;

    const newHistory: HistoryDataType = {
      ...history,
      [currentWeekKey]: finalSchedule
    };

    setHistory(newHistory);
    localStorage.setItem('GIAO_ROSTER_HISTORY_V2', JSON.stringify(newHistory));

    alert('✅ Đã lưu thành công! Lịch tuần này đã được chốt.');
  };

  const handleCloseModal = () => {
    setShowStaffDetails(false);
    setShowAssignedStats(false);
    setSelectedStaffDetail(null);
  };

  if (error) {
    return (
      <div className="container" style={{textAlign: 'center', padding: '50px', color: 'red'}}>
        <h2>⚠️ Lỗi tải dữ liệu</h2>
        <p>{error}</p>
        <button onClick={loadData} className="btn-outline" style={{marginTop:'10px'}}>Thử lại</button>
      </div>
    );
  }

  return (
    <div className="container">
      {isLoading && (
        <div className="loading-overlay">
          <div style={{textAlign:'center'}}>
            <h2 style={{marginBottom:'10px', color: '#c05640'}}>Đang tải dữ liệu...</h2>
            <p style={{color:'#666'}}>Đang đồng bộ từ Google Sheet</p>
          </div>
        </div>
      )}

      <header className="app-header">
        <img src={LOGO_URL} alt="Giao Cafe Logo" className="app-logo" />
        <h1>Lịch Làm Việc Tuần Sau</h1>
        <div style={{display:'flex', justifyContent:'center', alignItems:'center', gap:'15px', flexWrap:'wrap', marginTop: '10px'}}>
          <span style={{color: '#5e4b35', fontSize: '1.1rem', fontFamily: 'serif', fontStyle:'italic', background: '#fff', padding: '5px 15px', borderRadius: '20px', border: '1px solid #eaddd5'}}>
            Tuần: <strong>{weekDates['Mon'].dateStr} - {weekDates['Sun'].dateStr}</strong>
          </span>
          <button 
            onClick={loadData}
            className="btn-refresh"
          >
            🔄 Làm mới
          </button>
          <button onClick={onLogout} className="btn-logout">
            Đăng xuất
          </button>
        </div>
        {lastUpdated && (
          <div style={{fontSize: '0.75rem', color: '#8d7f71', marginTop: '5px'}}>
            Cập nhật lúc: {lastUpdated.toLocaleTimeString()}
          </div>
        )}
      </header>

      <div className="dashboard-card">
        <div className="stat-box" onClick={() => setShowStaffDetails(true)}>
          <div className="stat-icon">👥</div>
          <div className="stat-info">
            <div className="stat-label">Tiến độ đăng ký</div>
            <div className="stat-value">
              <span className={stats.registeredCount < stats.totalStaff ? 'text-warning' : 'text-success'}>
                {stats.registeredCount}
              </span>
              <span className="text-muted" style={{fontSize: '1.5rem'}}>/ {stats.totalStaff}</span>
            </div>
            <div className="stat-hint">
              {stats.totalStaff - stats.registeredCount > 0 
                ? `${stats.totalStaff - stats.registeredCount} bạn chưa nộp` 
                : 'Đã đủ người'}
            </div>
            <div style={{marginTop: '5px', fontSize: '0.8rem', color: '#c05640', textDecoration: 'underline'}}>Xem chi tiết</div>
          </div>
        </div>
      </div>

      {/* Modal Registration Detail */}
      {showStaffDetails && (
        <div className="modal-backdrop" onClick={handleCloseModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{fontFamily: 'serif', color: '#c05640', margin: 0}}>📋 Tình trạng đăng ký</h2>
              <button className="close-btn" onClick={handleCloseModal}>&times;</button>
            </div>
            <div className="staff-list-layout">
              <div className="staff-sidebar">
                {stats.staffDetails.map(staff => (
                  <div 
                    key={staff.id}
                    className={`staff-item ${selectedStaffDetail === staff.name ? 'active' : ''} ${staff.isLowRegistration ? 'warning' : ''}`}
                    onClick={() => setSelectedStaffDetail(staff.name)}
                  >
                    <div className="staff-name">{staff.name}</div>
                    <div className="staff-status">
                      {staff.status === 'not-registered' ? (
                        <span className="badge badge-gray">Chưa ĐK</span>
                      ) : (
                        <span className={`badge ${staff.isLowRegistration ? 'badge-red' : 'badge-green'}`}>
                          {staff.count} ngày {staff.isLowRegistration ? '(!)' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="staff-detail-panel">
                {selectedStaffDetail ? (
                  (() => {
                    const staff = stats.staffDetails.find(s => s.name === selectedStaffDetail);
                    if (!staff) return null;
                    return (
                      <div>
                        <h3 style={{marginBottom: '20px', borderBottom: '2px solid #f0ece4', paddingBottom: '10px', color: '#c05640', fontFamily: 'serif'}}>
                          {staff.name}
                        </h3>
                        
                        <div className="detail-row">
                          <strong>Trạng thái:</strong>{' '}
                          {staff.status === 'registered' 
                            ? <span className="text-success" style={{fontWeight:'bold'}}>Đã nộp form</span> 
                            : <span className="text-warning" style={{fontWeight:'bold'}}>Chưa nộp form</span>}
                        </div>

                        {staff.status === 'registered' && (
                          <>
                            <div className="detail-row">
                              <strong>Số ngày đăng ký:</strong> {staff.count}
                            </div>
                            <div className="detail-row">
                              <strong>Tổng số ca đăng ký:</strong> {staff.totalSlots}
                            </div>

                            {staff.isLowRegistration && (
                              <div className="alert-box">
                                <div style={{fontWeight: 'bold', marginBottom: '5px'}}>⚠️ Lưu ý: Đăng ký ít buổi</div>
                                <div>
                                  <strong>Lý do:</strong> {staff.reason || 'Không có lý do'}
                                </div>
                              </div>
                            )}

                            <div className="detail-row">
                              <strong>Các ca đã chọn:</strong>
                              <div className="tags-cloud">
                                {staff.slots?.length > 0 ? staff.slots.map((s: string) => {
                                  const [d, sh] = s.split('-');
                                  return <span key={s} className="tag">{DAY_LABELS[d]} - Ca {sh}</span>
                                }) : <span>Không có ca nào</span>}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  <div className="empty-state">
                    <p>👈 Chọn nhân viên bên trái để xem chi tiết</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Assigned Stats (Result) */}
      {showAssignedStats && finalSchedule && (
        <div className="modal-backdrop" onClick={handleCloseModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '650px', height: 'auto', maxHeight: '85vh'}}>
            <div className="modal-header">
              <h2 style={{fontFamily: 'serif', color: '#c05640', margin: 0}}>📊 Thống kê tổng số ca</h2>
              <button className="close-btn" onClick={handleCloseModal}>&times;</button>
            </div>
            <div style={{padding: '25px', overflowY: 'auto'}}>
              <p style={{color:'#666', marginBottom: '20px', fontStyle:'italic'}}>Danh sách được sắp xếp từ người làm ít ca nhất.</p>
              <table style={{width: '100%', borderCollapse: 'collapse'}}>
                <thead>
                  <tr style={{background: '#f3f0eb', textAlign: 'left'}}>
                    <th style={{padding: '12px', borderBottom: '2px solid #eaddd5', width:'40%'}}>Nhân viên</th>
                    <th style={{padding: '12px', borderBottom: '2px solid #eaddd5', width:'60%'}}>Số lượng ca</th>
                  </tr>
                </thead>
                <tbody>
                  {assignedStats.map(stat => {
                    const barWidth = `${(stat.total / (assignedStats[0]?.total || 1)) * 100}%`;
                    return (
                      <tr key={stat.name} style={{borderBottom: '1px solid #e5e7eb'}}>
                        <td style={{padding: '10px 12px', fontWeight: 500, color: '#4b3427'}}>
                          {stat.name}
                        </td>
                        <td style={{padding: '10px 12px'}}>
                          <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                            <div style={{flex: 1, height: '8px', background: '#f3f4f6', borderRadius: '999px', overflow: 'hidden'}}>
                              <div style={{
                                width: barWidth,
                                height: '100%',
                                background: 'linear-gradient(90deg, #fb923c, #f97316)',
                                borderRadius: '999px'
                              }} />
                            </div>
                            <span style={{fontSize: '0.9rem', fontWeight: 600}}>{stat.total}</span>
                          </div>
                          {stat.current > 0 && (
                            <div style={{fontSize: '0.85rem', color: '#4b5563', marginTop: '4px'}}>
                              Tuần này: <strong>{stat.current}</strong> ca
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="action-area">
        {!finalSchedule ? (
          <div className="initial-state">
            <button className="btn-generate" onClick={handleGenerate}>
              ✨ Tạo & Tối Ưu Lịch
            </button>
            <p style={{marginTop: '10px', color: '#8d7f71', fontSize: '0.9rem'}}>
              (Tự động xếp tối đa 2 người/ca, ưu tiên công bằng, không gãy ca)
            </p>
          </div>
        ) : (
          <div className="generated-state">
            <div style={{display:'flex', justifyContent:'center', gap:'15px', marginBottom: '15px'}}>
              <button className="btn-outline" onClick={() => setShowAssignedStats(true)}>
                📊 Xem Thống Kê Phân Công
              </button>
              <button
                className="btn-generate"
                style={{backgroundColor: isCurrentWeekSaved ? '#ccc' : '#57534e', cursor: isCurrentWeekSaved ? 'not-allowed' : 'pointer'}}
                onClick={handleGenerate}
                disabled={isCurrentWeekSaved}
              >
                {isCurrentWeekSaved ? '🔒 Đã Chốt Lịch' : '🔄 Xếp Lại Lịch'}
              </button>
              <button
                className="btn-generate"
                onClick={handleSaveWeek}
                disabled={isCurrentWeekSaved}
                style={{
                  backgroundColor: '#059669',
                  cursor: isCurrentWeekSaved ? 'not-allowed' : 'pointer'
                }}
              >
                {isCurrentWeekSaved ? '✅ Đã Lưu Vào Hệ Thống' : '💾 Lưu Kết Quả Tuần Này'}
              </button>
            </div>
            {isCurrentWeekSaved ? (
              <div style={{color: '#dc2626', fontSize: '0.9rem', marginBottom: '10px', fontStyle:'italic', fontWeight: 'bold'}}>
                🔒 Lịch tuần này đã được chốt và lưu vào dữ liệu tổng. Không thể thay đổi.
              </div>
            ) : (
              <div className="text-success" style={{fontWeight: 'bold', fontSize: '1.1rem', display:'flex', alignItems:'center', justifyContent: 'center', gap:'8px', color: '#15803d'}}>
                ✅ Đã tối ưu lịch xong!
              </div>
            )}
          </div>
        )}
      </div>

      {finalSchedule && (
        <div className="schedule-container fade-in">
          {/* Desktop: bảng */}
          <div className="table-responsive">
            <table className="new-schedule-table">
              <thead>
                <tr>
                  <th className="corner-cell" style={{width: '120px'}}>Ca \ Ngày</th>
                  {DAYS_ORDER.map(day => {
                    const { dateStr, isWeekend } = weekDates[day];
                    return (
                      <th key={day} className={`day-header ${isWeekend ? 'weekend-header' : ''}`}>
                        <div className="day-name">{DAY_LABELS[day]}</div>
                        <div className="day-date">{dateStr}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {SHIFTS.map(shift => (
                  <tr key={shift}>
                    <td className={`shift-header shift-row-${shift}`}>
                      <div className="shift-name">CA {shift}</div>
                      <div className="shift-time">{SHIFT_TIMES[shift]}</div>
                    </td>
                    {DAYS_ORDER.map(day => {
                      const staffList = finalSchedule[day][shift];
                      const { isWeekend } = weekDates[day];
                      let cellStatusClass = '';
                      if (staffList.length === 0) cellStatusClass = 'missing-slot';
                      else if (staffList.length === 1) cellStatusClass = 'single-slot';

                      return (
                        <td key={`${day}-${shift}`} className={`cell-content ${isWeekend ? 'weekend-cell' : ''} ${cellStatusClass}`}>
                          {staffList.length > 0 ? (
                            <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
                              {staffList.map((name: string) => {
                                const style = getStaffColor(name);
                                return (
                                  <div key={name} className="staff-chip" style={{
                                    backgroundColor: style.bg,
                                    border: `1px solid ${style.border}`,
                                    color: style.text
                                  }}>
                                    {name}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="empty-dash">-</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: card theo ngày */}
          <div className="mobile-schedule">
            {DAYS_ORDER.map(day => {
              const { dateStr } = weekDates[day];
              return (
                <div key={day} className="mobile-day-card">
                  <div className="mobile-day-header">
                    <div className="day-name">{DAY_LABELS[day]}</div>
                    <div className="day-date">{dateStr}</div>
                  </div>
                  <div className="mobile-shift-list">
                    {SHIFTS.map(shift => {
                      const staffList = finalSchedule[day][shift];
                      let cellStatusClass = '';
                      if (staffList.length === 0) cellStatusClass = 'missing-slot';
                      else if (staffList.length === 1) cellStatusClass = 'single-slot';

                      return (
                        <div key={`${day}-${shift}`} className="mobile-shift-row">
                          <div className="mobile-shift-label">
                            <div className="shift-name">Ca {shift}</div>
                            <div className="shift-time">{SHIFT_TIMES[shift]}</div>
                          </div>
                          <div className={`mobile-shift-content ${cellStatusClass}`}>
                            {staffList.length > 0 ? (
                              <div style={{display: 'flex', flexDirection: 'column', gap: '6px'}}>
                                {staffList.map((name: string) => {
                                  const style = getStaffColor(name);
                                  return (
                                    <div
                                      key={name}
                                      className="staff-chip"
                                      style={{
                                        backgroundColor: style.bg,
                                        border: `1px solid ${style.border}`,
                                        color: style.text
                                      }}
                                    >
                                      {name}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="empty-dash">-</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const isLogged = sessionStorage.getItem('isLoggedIn');
    if (isLogged === 'true') setIsAuthenticated(true);
  }, []);

  const handleLogin = () => {
    sessionStorage.setItem('isLoggedIn', 'true');
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('isLoggedIn');
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) return <LoginScreen onLogin={handleLogin} />;

  return <Dashboard onLogout={handleLogout} />;
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
