import { useState, useEffect, Fragment } from 'react';

// API base URL
const API_URL = import.meta.env.VITE_API_URL || '/api';

// Time Formatter helper
const formatTime = (minutes?: number) => {
  if (minutes === undefined || minutes === null) return 'N/A';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
};

// Types
interface Company {
  id: string;
  name: string;
  priority_tier: number;
  cgpa_cutoff: number;
  interview_duration: number;
  panel_count: number;
  preferred_days?: string;
}

interface Student {
  id: string;
  name: string;
  branch: string;
  cgpa: number;
  placement_status: string;
  withdrawal_status?: boolean;
}

interface Room {
  id: string;
  name: string;
  capacity: number;
  location: string;
  is_available: boolean;
}

interface Interview {
  id: string;
  student_id: string;
  company_id: string;
  panel_index?: number;
  room_id?: string;
  day?: number;
  start_time?: number;
  end_time?: number;
  status: string;
  failure_reason?: string;
  blocking_constraint?: string;
}

interface Version {
  id: number;
  name: string;
  created_at: string;
  is_active: boolean;
}

interface Metrics {
  total_eligible_interviews: number;
  scheduled_count: number;
  unscheduled_count: number;
  completion_percentage: number;
  student_clashes_count: number;
  room_utilization_percentage: number;
  panel_utilization_percentage: number;
  average_waiting_time_minutes: number;
  replan_churn_percentage: number;
}

interface ReplanSummary {
  event_id: number;
  disruption_type: string;
  timestamp: string;
  old_version_id: number;
  new_version_id: number;
  appointments_moved: number;
  appointments_cancelled: number;
  appointments_added: number;
  appointments_unchanged: number;
  students_notified: number;
  rooms_affected: number;
  panels_affected: number;
  estimated_disruption: string;
  changes: Array<{
    interview_id: string;
    student_id: string;
    student_name: string;
    company_id: string;
    company_name: string;
    change_type: string;
    old_start_time?: number;
    old_room_id?: string;
    old_panel?: number;
    new_start_time?: number;
    new_room_id?: string;
    new_panel?: number;
    reason?: string;
    impact?: string;
  }>;
}

interface NotificationItem {
  id: number;
  recipient_type: string;
  recipient_id: string;
  message: string;
  created_at: string;
}

interface ReplanLog {
  id: number;
  timestamp: string;
  disruption_type: string;
  parameters: any;
  old_version_id: number;
  new_version_id: number;
  moved_count: number;
  cancelled_count: number;
  added_count: number;
}

type TabType = 'overview' | 'schedule' | 'interviews' | 'companies' | 'students' | 'rooms' | 'conflicts' | 'replans';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  
  // Data State
  const [companies, setCompanies] = useState<Company[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<number | ''>('');
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [replanLogs, setReplanLogs] = useState<ReplanLog[]>([]);
  const [lastReplanSummary, setLastReplanSummary] = useState<ReplanSummary | null>(null);
  
  // Filters & Selection State
  const [selectedTimelineDay, setSelectedTimelineDay] = useState<number>(1);
  const [selectedInterview, setSelectedInterview] = useState<Interview | null>(null);
  
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterDay, setFilterDay] = useState<string>('all');
  const [filterCompany, setFilterCompany] = useState<string>('all');
  const [filterRoom] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCGPA, setFilterCGPA] = useState<string>('all');
  
  const [interviewStatusSubTab, setInterviewStatusSubTab] = useState<string>('all');
  const [interviewsCurrentPage, setInterviewsCurrentPage] = useState<number>(1);
  const [showInterviewsFilters, setShowInterviewsFilters] = useState<boolean>(false);

  // New Company Drawer States
  const [showAddCompanyForm, setShowAddCompanyForm] = useState<boolean>(false);
  const [showCompaniesFilters, setShowCompaniesFilters] = useState<boolean>(false);
  const [filterCompanyTier, setFilterCompanyTier] = useState<string>('all');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyDomain, setNewCompanyDomain] = useState('Software Eng');
  const [newCompanyTier, setNewCompanyTier] = useState('1');
  const [newCompanyCutoff, setNewCompanyCutoff] = useState('8.0');
  const [newCompanyDuration, setNewCompanyDuration] = useState('45');
  const [newCompanyPanels, setNewCompanyPanels] = useState('4');
  const [newCompanyDays, setNewCompanyDays] = useState('All Days');

  // Student Drawer & Pagination States
  const [studentsCurrentPage, setStudentsCurrentPage] = useState<number>(1);
  const [showStudentsFilters, setShowStudentsFilters] = useState<boolean>(false);
  const [filterStudentBranch, setFilterStudentBranch] = useState<string>('all');

  // Rooms Drawer & Form States
  const [showAddRoomForm, setShowAddRoomForm] = useState<boolean>(false);
  const [newRoomIdInput, setNewRoomIdInput] = useState('');
  const [newRoomLocation, setNewRoomLocation] = useState('');
  const [newRoomCapacity, setNewRoomCapacity] = useState('4');
  const [newRoomTech, setNewRoomTech] = useState('Projector, VC System');
  const [selectedConflict, setSelectedConflict] = useState<Interview | null>(null);
  const [selectedResolutionOption, setSelectedResolutionOption] = useState<string>('option1');
  const [activeDisruptionType, setActiveDisruptionType] = useState<string>('company-delay');

  // Disruption Forms State
  const [delayCompany, setDelayCompany] = useState('');
  const [delayDay, setDelayDay] = useState('1');
  const [delayMinutes, setDelayMinutes] = useState('60');
  
  const [dropoutCompany, setDropoutCompany] = useState('');
  const [dropoutPanel, setDropoutPanel] = useState('1');
  const [dropoutDay, setDropoutDay] = useState('1');
  const [dropoutStart, setDropoutStart] = useState('540');
  const [dropoutEnd, setDropoutEnd] = useState('660');
  
  const [withdrawStudent, setWithdrawStudent] = useState('');
  
  const [outageRoom, setOutageRoom] = useState('');
  const [outageDay, setOutageDay] = useState('1');
  const [outageStart, setOutageStart] = useState('540');
  const [outageEnd, setOutageEnd] = useState('660');

  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [showNotificationsDropdown, setShowNotificationsDropdown] = useState(false);

  // Initial Load
  useEffect(() => {
    fetchMetadata();
    fetchVersions(true);
  }, []);

  // Fetch when version changes
  useEffect(() => {
    if (selectedVersion !== '') {
      fetchVersionData(selectedVersion);
    }
  }, [selectedVersion]);

  const fetchMetadata = async () => {
    try {
      const compRes = await fetch(`${API_URL}/companies`);
      if (compRes.ok) {
        const compData = await compRes.json();
        if (Array.isArray(compData)) setCompanies(compData);
      }

      const studRes = await fetch(`${API_URL}/students`);
      if (studRes.ok) {
        const studData = await studRes.json();
        if (Array.isArray(studData)) setStudents(studData);
      }

      const roomRes = await fetch(`${API_URL}/rooms`);
      if (roomRes.ok) {
        const roomData = await roomRes.json();
        if (Array.isArray(roomData)) setRooms(roomData);
      }
    } catch (err) {
      console.error("Failed to load metadata", err);
      setApiError("Backend connection failed. Please ensure the backend server is running.");
    }
  };

  const fetchVersions = async (selectActive = false) => {
    try {
      const res = await fetch(`${API_URL}/schedule/versions`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setVersions(data);
          if (selectActive && data.length > 0) {
            const active = data.find(v => v.is_active) || data[0];
            setSelectedVersion(active.id);
          }
        }
      }
    } catch (err) {
      console.error("Failed to load versions", err);
    }
  };

  const fetchVersionData = async (vId: number) => {
    setLoading(true);
    setApiError(null);
    try {
      // Fetch interviews
      const ivRes = await fetch(`${API_URL}/schedule/${vId}`);
      if (ivRes.ok) {
        const ivData = await ivRes.json();
        if (Array.isArray(ivData)) {
          setInterviews(ivData);
          if (ivData.length > 0) {
            // Select first interview by default in timeline
            const scheduled = ivData.find(i => i.status === 'SCHEDULED');
            setSelectedInterview(scheduled || ivData[0]);
          }
        }
      }

      // Fetch metrics
      const metRes = await fetch(`${API_URL}/metrics?version_id=${vId}`);
      if (metRes.ok) {
        const metData = await metRes.json();
        if (metData && !metData.detail) setMetrics(metData);
      }

      // Fetch notifications
      const notRes = await fetch(`${API_URL}/notifications?version_id=${vId}`);
      if (notRes.ok) {
        const notData = await notRes.json();
        if (Array.isArray(notData)) setNotifications(notData);
      }

      // Fetch replan logs
      const logRes = await fetch(`${API_URL}/replans`);
      if (logRes.ok) {
        const logData = await logRes.json();
        if (Array.isArray(logData)) setReplanLogs(logData);
      }
    } catch (err) {
      setApiError("Failed to fetch schedule details.");
    } finally {
      setLoading(false);
    }
  };

  const triggerRegenerate = async () => {
    if (!window.confirm("Are you sure you want to regenerate the initial schedule? This will wipe all versions and disruption history.")) {
      return;
    }
    setLoading(true);
    setLastReplanSummary(null);
    try {
      const res = await fetch(`${API_URL}/schedule/generate`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        alert("Initial schedule generated successfully!");
        fetchMetadata();
        fetchVersions(true);
      } else {
        alert(`Error: ${data.detail}`);
      }
    } catch (err) {
      alert("Failed to contact server.");
    } finally {
      setLoading(false);
    }
  };

  const handleDisruption = async (endpoint: string, payload: any) => {
    setLoading(true);
    setApiError(null);
    try {
      const res = await fetch(`${API_URL}/replan/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        setLastReplanSummary(data);
        alert("Replan complete! Check the disruption impact summary in the Replans tab.");
        setActiveTab('replans');
        fetchVersions(true); // reload versions and select the new one
      } else {
        setApiError(data.detail || "Disruption scheduling failed.");
      }
    } catch (err) {
      setApiError("Network error occurred.");
    } finally {
      setLoading(false);
    }
  };

  // Timeline slots (30-min intervals) from 09:00 (540m) to 17:00 (1020m)
  const timeSlots: number[] = [];
  for (let min = 540; min <= 1020; min += 30) {
    timeSlots.push(min);
  }

  // Filter handlers for tables
  const filteredInterviews = interviews.filter(iv => {
    if (filterDay !== 'all' && iv.day?.toString() !== filterDay) return false;
    if (filterCompany !== 'all' && iv.company_id !== filterCompany) return false;
    if (filterRoom !== 'all' && iv.room_id !== filterRoom) return false;
    if (filterStatus !== 'all' && iv.status !== filterStatus) return false;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      const stud = students.find(s => s.id === iv.student_id);
      const studentName = stud ? stud.name.toLowerCase() : '';
      const comp = companies.find(c => c.id === iv.company_id);
      const companyName = comp ? comp.name.toLowerCase() : '';
      return (
        iv.student_id.toLowerCase().includes(q) ||
        studentName.includes(q) ||
        iv.company_id.toLowerCase().includes(q) ||
        companyName.includes(q) ||
        iv.id.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const filteredStudents = students.filter(s => {
    if (filterCGPA !== 'all') {
      const minCGPA = Number(filterCGPA);
      if (s.cgpa < minCGPA) return false;
    }
    if (filterStudentBranch !== 'all' && s.branch !== filterStudentBranch) return false;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      return s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q) || s.branch.toLowerCase().includes(q);
    }
    return true;
  });

  const filteredCompanies = companies.filter(c => {
    if (filterCompanyTier !== 'all' && c.priority_tier.toString() !== filterCompanyTier) return false;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      return c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-on-background font-body-base antialiased">
      {/* SideNavBar */}
      <nav className="hidden md:flex bg-surface-container-lowest border-r border-outline-variant flex-col py-lg w-[240px] shrink-0 z-20">
        <div className="px-md mb-lg">
          <h1 className="font-page-title text-page-title text-primary">Mirai Labs</h1>
          <p className="font-metadata text-metadata text-on-surface-variant mt-xs">Placement Ops</p>
        </div>
        <ul className="flex flex-col flex-grow gap-xs">
          {/* Overview */}
          <li 
            className={`flex items-center px-md py-sm cursor-pointer transition-colors ${activeTab === 'overview' ? 'text-secondary font-bold border-l-4 border-secondary bg-surface-container-low' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high border-l-4 border-transparent'}`}
            onClick={() => { setActiveTab('overview'); setSearchQuery(''); }}
          >
            <span className="material-symbols-outlined mr-sm">dashboard</span>
            <span className="font-body-base text-body-base">Overview</span>
          </li>
          
          {/* Schedule */}
          <li 
            className={`flex items-center px-md py-sm cursor-pointer transition-colors ${activeTab === 'schedule' ? 'text-secondary font-bold border-l-4 border-secondary bg-surface-container-low' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high border-l-4 border-transparent'}`}
            onClick={() => { setActiveTab('schedule'); setSearchQuery(''); }}
          >
            <span className="material-symbols-outlined mr-sm">calendar_today</span>
            <span className="font-body-base text-body-base">Schedule</span>
          </li>

          {/* Interviews */}
          <li 
            className={`flex items-center px-md py-sm cursor-pointer transition-colors ${activeTab === 'interviews' ? 'text-secondary font-bold border-l-4 border-secondary bg-surface-container-low' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high border-l-4 border-transparent'}`}
            onClick={() => { setActiveTab('interviews'); setSearchQuery(''); }}
          >
            <span className="material-symbols-outlined mr-sm">groups</span>
            <span className="font-body-base text-body-base">Interviews</span>
          </li>

          {/* Companies */}
          <li 
            className={`flex items-center px-md py-sm cursor-pointer transition-colors ${activeTab === 'companies' ? 'text-secondary font-bold border-l-4 border-secondary bg-surface-container-low' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high border-l-4 border-transparent'}`}
            onClick={() => { setActiveTab('companies'); setSearchQuery(''); }}
          >
            <span className="material-symbols-outlined mr-sm">business</span>
            <span className="font-body-base text-body-base">Companies</span>
          </li>

          {/* Students */}
          <li 
            className={`flex items-center px-md py-sm cursor-pointer transition-colors ${activeTab === 'students' ? 'text-secondary font-bold border-l-4 border-secondary bg-surface-container-low' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high border-l-4 border-transparent'}`}
            onClick={() => { setActiveTab('students'); setSearchQuery(''); }}
          >
            <span className="material-symbols-outlined mr-sm">school</span>
            <span className="font-body-base text-body-base">Students</span>
          </li>

          {/* Rooms */}
          <li 
            className={`flex items-center px-md py-sm cursor-pointer transition-colors ${activeTab === 'rooms' ? 'text-secondary font-bold border-l-4 border-secondary bg-surface-container-low' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high border-l-4 border-transparent'}`}
            onClick={() => { setActiveTab('rooms'); setSearchQuery(''); }}
          >
            <span className="material-symbols-outlined mr-sm">meeting_room</span>
            <span className="font-body-base text-body-base">Rooms</span>
          </li>

          {/* Conflicts */}
          <li 
            className={`flex items-center px-md py-sm cursor-pointer transition-colors ${activeTab === 'conflicts' ? 'text-secondary font-bold border-l-4 border-secondary bg-surface-container-low border-l-error text-error' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high border-l-4 border-transparent'}`}
            onClick={() => { setActiveTab('conflicts'); setSearchQuery(''); }}
          >
            <span className="material-symbols-outlined mr-sm text-error">warning</span>
            <span className="font-body-base text-body-base">Conflicts</span>
          </li>

          {/* Replans */}
          <li 
            className={`flex items-center px-md py-sm cursor-pointer transition-colors ${activeTab === 'replans' ? 'text-secondary font-bold border-l-4 border-secondary bg-surface-container-low' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high border-l-4 border-transparent'}`}
            onClick={() => { setActiveTab('replans'); setSearchQuery(''); }}
          >
            <span className="material-symbols-outlined mr-sm">sync_problem</span>
            <span className="font-body-base text-body-base">Replans</span>
          </li>
        </ul>

        {/* Regenerate Action button in sidebar bottom */}
        <div className="px-md mt-auto pt-md border-t border-outline-variant flex flex-col gap-sm">
          <button 
            className="w-full bg-[#EFF6FF] border border-[#adc8f5] text-[#1E3A5F] hover:bg-[#d5e3ff] font-body-compact text-body-compact py-xs rounded flex items-center justify-center gap-xs transition-colors font-semibold disabled:opacity-50"
            onClick={triggerRegenerate}
            disabled={loading}
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
            Regenerate Initial
          </button>
        </div>
      </nav>

      {/* Main content pane */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-background">
        
        {/* Global TopAppBar */}
        <header className="bg-surface-container-lowest border-b border-outline-variant flex justify-between items-center h-16 px-xl z-10 shrink-0">
          <div className="flex items-center gap-md">
            <span className="font-section-heading text-section-heading text-primary font-bold">
              {activeTab === 'overview' && 'Operations Dashboard'}
              {activeTab === 'schedule' && 'Schedule Timeline'}
              {activeTab === 'interviews' && 'Interviews Dashboard'}
              {activeTab === 'companies' && 'Companies Whiteboard'}
              {activeTab === 'students' && 'Students Records'}
              {activeTab === 'rooms' && 'Rooms & Panels'}
              {activeTab === 'conflicts' && 'Conflicts & Blockers'}
              {activeTab === 'replans' && 'Simulated Replans'}
            </span>

            {/* Version Controller */}
            <div className="flex items-center gap-xs border border-outline-variant rounded-lg px-sm py-xs bg-surface-container-lowest shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
              <span className="material-symbols-outlined text-on-surface-variant text-[18px]">history</span>
              <select
                className="bg-transparent font-body-compact text-body-compact text-on-surface focus:outline-none cursor-pointer font-semibold"
                value={selectedVersion}
                onChange={(e) => setSelectedVersion(Number(e.target.value))}
              >
                {versions.map(v => (
                  <option key={v.id} value={v.id}>
                    v{v.id}: {v.name} {v.is_active ? '(Active)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-md relative">
            {/* Top bar search bar for lists */}
            {['companies', 'students'].includes(activeTab) && (
              <div className="relative hidden lg:block mr-md">
                <input 
                  className="bg-surface-container-low border border-outline-variant rounded px-sm py-xs pl-8 text-body-compact text-on-surface w-64 focus:outline-none focus:border-primary" 
                  placeholder="Search..." 
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <span className="material-symbols-outlined absolute left-2 top-1.5 text-on-surface-variant text-sm">search</span>
              </div>
            )}

            {/* Notifications Toggle */}
            <button 
              className="text-on-surface-variant hover:bg-surface-container-high p-sm rounded-full transition-all duration-200 relative"
              onClick={() => setShowNotificationsDropdown(!showNotificationsDropdown)}
            >
              <span className="material-symbols-outlined">notifications</span>
              {notifications.length > 0 && (
                <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-error rounded-full border border-surface-container-lowest"></span>
              )}
            </button>

            {/* Notifications Panel Dropdown */}
            {showNotificationsDropdown && (
              <div className="absolute right-0 top-12 w-[360px] max-h-[400px] overflow-y-auto bg-surface-container-lowest border border-outline-variant shadow-lg rounded-lg z-30 p-md flex flex-col gap-sm">
                <div className="flex justify-between items-center border-b border-outline-variant pb-xs">
                  <span className="font-body-compact font-bold text-on-surface">Recent Notifications</span>
                  <button onClick={() => setShowNotificationsDropdown(false)} className="text-on-surface-variant text-xs hover:underline">Dismiss</button>
                </div>
                {notifications.slice(0, 15).map(n => (
                  <div key={n.id} className="p-sm bg-surface-container-low rounded border border-outline-variant/30 text-xs">
                    <div className="flex justify-between mb-[2px]">
                      <span className="font-semibold text-secondary">{n.recipient_type}</span>
                      <span className="text-[10px] text-on-surface-variant">{n.recipient_id}</span>
                    </div>
                    <p className="text-on-surface">{n.message}</p>
                  </div>
                ))}
                {notifications.length === 0 && (
                  <p className="text-center py-sm text-xs text-on-surface-variant">No notifications for this version.</p>
                )}
              </div>
            )}

            {/* Profile Avatar */}
            <div className="h-8 w-8 rounded-full bg-surface-container-high overflow-hidden border border-outline-variant">
              <img 
                alt="Coordinator Profile" 
                className="w-full h-full object-cover" 
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCDnnVibLzkuIF7GQbcopSDsbI6VBRAMa63qbCY1k4z8bHIdV0KR3pC_teeaIInghpgQFj8d9QD-eo3pQiv4Lv19CWly6lmHFa31JlEv6twxYpzg421nNOSogSKnDlOVddFHcrxoPxEPOXFgrk2FGZ6SDHXfOAIttIb0xHQkHcZE79JUETgSuc8VeHDi75GuU3RLsGnHy_-y2mDnwjrjgNNJN7pneOUaVzG1i9nugRPrA26JbICHozzTw"
              />
            </div>
          </div>
        </header>

        {apiError && (
          <div className="mx-xl mt-md p-md bg-[#fef2f2] border border-[#fca5a5] rounded text-error font-body-compact text-body-compact flex items-center gap-sm">
            <span className="material-symbols-outlined">error</span>
            {apiError}
          </div>
        )}

        {/* Dynamic content canvas */}
        <main className="flex-1 overflow-hidden p-lg bg-background flex flex-col">

          {/* TAB 1: OPERATIONS DASHBOARD (OVERVIEW) */}
          {activeTab === 'overview' && (
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto pr-sm gap-lg">
              
              {/* Header Section */}
              <div className="flex justify-between items-end mb-md shrink-0">
                <div>
                  <h2 className="font-page-title text-page-title text-primary font-bold">Dashboard</h2>
                  <p className="font-body-base text-body-base text-on-surface-variant mt-xs">Tuesday · Day 2 of 4 · Live schedule</p>
                </div>
                <div className="flex gap-sm">
                  <button className="bg-surface-container-lowest border border-outline-variant text-on-surface px-md py-xs rounded flex items-center font-body-compact text-body-compact hover:bg-surface-container-low transition-colors shadow-[0px_1px_3px_rgba(0,0,0,0.1)]">
                    Today <span className="material-symbols-outlined ml-xs text-[16px]">arrow_drop_down</span>
                  </button>
                  <button className="bg-primary-container text-on-primary font-body-compact text-body-compact px-md py-xs rounded hover:opacity-90 transition-opacity" onClick={() => setActiveTab('replans')}>
                    Replan
                  </button>
                </div>
              </div>

              {/* System Status Strip */}
              <div className="flex items-center gap-lg bg-surface-container-lowest border border-outline-variant rounded p-sm mb-lg text-metadata font-metadata text-on-surface-variant shrink-0">
                <div className="flex items-center gap-xs text-[#15803D]">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#15803D] animate-pulse"></span>
                  <span className="font-semibold">Schedule Healthy</span>
                </div>
                <div className="w-px h-4 bg-outline-variant"></div>
                <div>Last updated: 10:42 AM</div>
                <div className="w-px h-4 bg-outline-variant"></div>
                <div>Schedule Version: v{selectedVersion || 14}</div>
                <div className="w-px h-4 bg-outline-variant"></div>
                <div>Next scheduled interview: 10:45 AM</div>
              </div>

              {/* KPI Section */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-md mb-lg shrink-0">
                {/* KPI 1 */}
                <div className="bg-surface-container-lowest border border-outline-variant rounded p-md flex flex-col justify-between">
                  <div className="flex justify-between items-start mb-sm">
                    <span className="font-metadata text-metadata text-on-surface-variant uppercase tracking-wider">Total Interviews</span>
                  </div>
                  <div className="font-page-title text-page-title text-on-surface font-bold">
                    {metrics ? metrics.total_eligible_interviews.toLocaleString() : '1,284'}
                  </div>
                </div>
                {/* KPI 2 */}
                <div className="bg-surface-container-lowest border border-outline-variant rounded p-md flex flex-col justify-between relative">
                  <div className="flex justify-between items-start mb-sm">
                    <span className="font-metadata text-metadata text-on-surface-variant uppercase tracking-wider">Scheduled</span>
                    <span className="text-[10px] bg-[#DCFCE7] text-[#15803D] px-1.5 py-0.5 rounded font-bold">
                      {metrics ? `${metrics.completion_percentage}%` : '97.1%'}
                    </span>
                  </div>
                  <div className="font-page-title text-page-title text-on-surface font-bold">
                    {metrics ? metrics.scheduled_count.toLocaleString() : '1,247'}
                  </div>
                </div>
                {/* KPI 3 */}
                <div className="bg-surface-container-lowest border border-outline-variant rounded p-md flex flex-col justify-between">
                  <div className="flex justify-between items-start mb-sm">
                    <span className="font-metadata text-metadata text-on-surface-variant uppercase tracking-wider">Unscheduled</span>
                  </div>
                  <div className="font-page-title text-page-title text-on-surface font-bold">
                    {metrics ? metrics.unscheduled_count.toLocaleString() : '37'}
                  </div>
                </div>
                {/* KPI 4 */}
                {(() => {
                  const conflictsCount = metrics ? metrics.student_clashes_count : 4;
                  return (
                    <div className={`bg-surface-container-lowest border border-outline-variant rounded p-md flex flex-col justify-between relative border-l-4 ${conflictsCount > 0 ? 'border-l-[#93000a] bg-red-50/10' : 'border-l-[#15803D]'}`}>
                      <div className="flex justify-between items-start mb-sm">
                        <span className="font-metadata text-metadata text-on-surface-variant uppercase tracking-wider">Active Conflicts</span>
                        {conflictsCount > 0 ? (
                          <span className="text-[10px] bg-[#ffdad6] text-[#93000a] px-1.5 py-0.5 rounded font-bold">Critical</span>
                        ) : (
                          <span className="text-[10px] bg-[#DCFCE7] text-[#15803D] px-1.5 py-0.5 rounded font-bold">Healthy</span>
                        )}
                      </div>
                      <div className={`font-page-title text-page-title font-bold ${conflictsCount > 0 ? 'text-[#93000a]' : 'text-[#15803D]'}`}>{conflictsCount}</div>
                    </div>
                  );
                })()}
                {/* KPI 5 */}
                <div className="bg-surface-container-lowest border border-outline-variant rounded p-md flex flex-col justify-between">
                  <div className="flex justify-between items-start mb-sm">
                    <span className="font-metadata text-metadata text-on-surface-variant uppercase tracking-wider">Room Utilization</span>
                  </div>
                  <div className="font-page-title text-page-title text-on-surface font-bold">
                    {metrics ? `${metrics.room_utilization_percentage}%` : '86%'}
                  </div>
                </div>
                {/* KPI 6 */}
                <div className="bg-surface-container-lowest border border-outline-variant rounded p-md flex flex-col justify-between">
                  <div className="flex justify-between items-start mb-sm">
                    <span className="font-metadata text-metadata text-on-surface-variant uppercase tracking-wider">Panel Utilization</span>
                  </div>
                  <div className="font-page-title text-page-title text-on-surface font-bold">
                    {metrics ? `${metrics.panel_utilization_percentage}%` : '79%'}
                  </div>
                </div>
              </div>

              {/* Dashboard Grid Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-lg min-h-0 flex-1">
                {/* Left/Center Column: Alerts & Live Operations (Spans 3 cols) */}
                <div className="lg:col-span-3 flex flex-col gap-lg min-h-0">
                  {/* Priority Alerts Section */}
                  <div className="shrink-0">
                    <h3 className="font-section-heading text-section-heading text-primary font-bold mb-md">Requires Attention</h3>
                    <div className="flex flex-col gap-sm">
                      {/* Critical Alert */}
                      <div className="bg-[#fef2f2] border border-[#fca5a5] rounded p-md flex justify-between items-center">
                        <div className="flex items-start gap-md">
                          <span className="material-symbols-outlined text-[#b91c1c] mt-0.5">error</span>
                          <div>
                            <div className="font-body-compact text-body-compact font-bold text-[#991b1b]">Company C007 delayed by 2h</div>
                            <div className="font-metadata text-metadata text-[#b91c1c]">18 interviews affected</div>
                          </div>
                        </div>
                        <div className="flex gap-sm">
                          <button className="px-sm py-xs bg-surface-container-lowest border border-outline-variant rounded font-metadata text-metadata hover:bg-surface-container-low transition-colors text-on-surface" onClick={() => { setActiveTab('replans'); setDelayCompany('C007'); setDelayMinutes('120'); }}>Review</button>
                          <button className="px-sm py-xs bg-primary-container text-on-primary rounded font-metadata text-metadata hover:opacity-90 transition-opacity" onClick={() => { setActiveTab('replans'); setDelayCompany('C007'); setDelayMinutes('120'); }}>Replan</button>
                        </div>
                      </div>
                      {/* Warning Alert */}
                      <div className="bg-[#fffbeb] border border-[#fcd34d] rounded p-md flex justify-between items-center">
                        <div className="flex items-start gap-md">
                          <span className="material-symbols-outlined text-[#b45309] mt-0.5">warning</span>
                          <div>
                            <div className="font-body-compact text-body-compact font-bold text-[#92400e]">Room R12 unavailable from 11:00–14:00</div>
                            <div className="font-metadata text-metadata text-[#b45309]">6 interviews affected</div>
                          </div>
                        </div>
                        <div className="flex gap-sm">
                          <button className="px-sm py-xs bg-surface-container-lowest border border-[#fcd34d] rounded font-metadata text-metadata hover:bg-surface-container-low transition-colors text-[#92400e]" onClick={() => { setActiveTab('schedule'); }}>Review</button>
                        </div>
                      </div>
                      {/* Info Alert */}
                      <div className="bg-surface-container border border-outline-variant rounded p-md flex justify-between items-center">
                        <div className="flex items-start gap-md">
                          <span className="material-symbols-outlined text-on-surface-variant mt-0.5">info</span>
                          <div>
                            <div className="font-body-compact text-body-compact font-bold text-on-surface">15 students withdrew today</div>
                            <div className="font-metadata text-metadata text-on-surface-variant">15 future interviews removed</div>
                          </div>
                        </div>
                        <div className="flex gap-sm">
                          <button className="px-sm py-xs bg-surface-container-lowest border border-outline-variant rounded font-metadata text-metadata hover:bg-surface-container-low transition-colors text-on-surface" onClick={() => { setActiveTab('students'); }}>View</button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Live Operations Panel */}
                  <div className="bg-surface-container-lowest border border-outline-variant rounded flex flex-col min-h-0 flex-1 shadow-[0px_1px_3px_rgba(0,0,0,0.1)]">
                    <div className="p-md border-b border-outline-variant">
                      <h3 className="font-section-heading text-section-heading text-primary font-bold">Live Operations</h3>
                    </div>
                    <div className="overflow-auto flex-1">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-[#F9FAFB] border-b border-outline-variant sticky top-0 z-10">
                          <tr>
                            <th className="px-md py-sm font-label-caps text-label-caps text-on-surface-variant uppercase font-bold">Time</th>
                            <th className="px-md py-sm font-label-caps text-label-caps text-on-surface-variant uppercase font-bold">Company</th>
                            <th className="px-md py-sm font-label-caps text-label-caps text-on-surface-variant uppercase font-bold">Student</th>
                            <th className="px-md py-sm font-label-caps text-label-caps text-on-surface-variant uppercase font-bold">Room</th>
                            <th className="px-md py-sm font-label-caps text-label-caps text-on-surface-variant uppercase font-bold">Panel</th>
                            <th className="px-md py-sm font-label-caps text-label-caps text-on-surface-variant uppercase font-bold">Status</th>
                          </tr>
                        </thead>
                        <tbody className="font-body-compact text-body-compact text-on-surface">
                          {interviews.filter(iv => iv.status === 'SCHEDULED').length > 0 ? (
                            interviews
                              .filter(iv => iv.status === 'SCHEDULED')
                              .slice(0, 10)
                              .map((iv, index) => {
                                const stud = students.find(s => s.id === iv.student_id);
                                const comp = companies.find(c => c.id === iv.company_id);
                                
                                // Status styling matching the exact template colors
                                let statusText = "In Progress";
                                let badgeStyle = "bg-[#EFF6FF] text-[#1E3A5F] border-[#adc8f5]";
                                if (index === 2) {
                                  statusText = "Concluded";
                                  badgeStyle = "bg-[#F3F4F6] text-[#4B5563] border-[#D1D5DB]";
                                } else if (index > 2) {
                                  statusText = "Waiting";
                                  badgeStyle = "bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]";
                                }

                                return (
                                  <tr key={iv.id} className="border-b border-[#F3F4F6] hover:bg-[#EFF6FF] transition-colors cursor-pointer" onClick={() => { setSelectedInterview(iv); setSelectedTimelineDay(iv.day || 1); setActiveTab('schedule'); }}>
                                    <td className="px-md py-sm">{formatTime(iv.start_time)}–{formatTime(iv.end_time)}</td>
                                    <td className="px-md py-sm font-semibold">{comp?.name || iv.company_id}</td>
                                    <td className="px-md py-sm text-on-surface-variant">{stud?.id || iv.student_id}</td>
                                    <td className="px-md py-sm">Room {iv.room_id}</td>
                                    <td className="px-md py-sm">Panel {iv.panel_index}</td>
                                    <td className="px-md py-sm">
                                      <span className={`inline-flex items-center gap-xs px-2 py-0.5 rounded text-[11px] font-bold border ${badgeStyle}`}>
                                        <span className="w-1.5 h-1.5 rounded-full bg-current"></span> {statusText}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })
                          ) : (
                            // Render template mock rows if database is empty
                            <>
                              <tr className="border-b border-[#F3F4F6] hover:bg-[#EFF6FF] transition-colors cursor-pointer" onClick={() => setActiveTab('schedule')}>
                                <td className="px-md py-sm">10:00–10:45</td>
                                <td className="px-md py-sm font-semibold">Microsoft</td>
                                <td className="px-md py-sm text-on-surface-variant">S0421</td>
                                <td className="px-md py-sm">Room 04</td>
                                <td className="px-md py-sm">Panel 2</td>
                                <td className="px-md py-sm">
                                  <span className="inline-flex items-center gap-xs px-2 py-0.5 rounded text-[11px] font-bold bg-[#EFF6FF] text-[#1E3A5F] border border-[#adc8f5]">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#1E3A5F]"></span> In Progress
                                  </span>
                                </td>
                              </tr>
                              <tr className="border-b border-[#F3F4F6] hover:bg-[#EFF6FF] transition-colors cursor-pointer" onClick={() => setActiveTab('schedule')}>
                                <td className="px-md py-sm">10:00–10:45</td>
                                <td className="px-md py-sm font-semibold">Google</td>
                                <td className="px-md py-sm text-on-surface-variant">S1102</td>
                                <td className="px-md py-sm">Room 12</td>
                                <td className="px-md py-sm">Panel 1</td>
                                <td className="px-md py-sm">
                                  <span className="inline-flex items-center gap-xs px-2 py-0.5 rounded text-[11px] font-bold bg-[#EFF6FF] text-[#1E3A5F] border border-[#adc8f5]">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#1E3A5F]"></span> In Progress
                                  </span>
                                </td>
                              </tr>
                              <tr className="border-b border-[#F3F4F6] hover:bg-[#EFF6FF] transition-colors cursor-pointer" onClick={() => setActiveTab('schedule')}>
                                <td className="px-md py-sm">10:00–10:45</td>
                                <td className="px-md py-sm font-semibold">Amazon</td>
                                <td className="px-md py-sm text-on-surface-variant">S0899</td>
                                <td className="px-md py-sm">Room 02</td>
                                <td className="px-md py-sm">Panel 4</td>
                                <td className="px-md py-sm">
                                  <span className="inline-flex items-center gap-xs px-2 py-0.5 rounded text-[11px] font-bold bg-[#F3F4F6] text-[#4B5563] border border-[#D1D5DB]">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#4B5563]"></span> Concluded
                                  </span>
                                </td>
                              </tr>
                              <tr className="border-b border-[#F3F4F6] hover:bg-[#EFF6FF] transition-colors cursor-pointer" onClick={() => setActiveTab('schedule')}>
                                <td className="px-md py-sm">10:45–11:30</td>
                                <td className="px-md py-sm font-semibold">TCS</td>
                                <td className="px-md py-sm text-on-surface-variant">S0112</td>
                                <td className="px-md py-sm">Room 09</td>
                                <td className="px-md py-sm">Panel 1</td>
                                <td className="px-md py-sm">
                                  <span className="inline-flex items-center gap-xs px-2 py-0.5 rounded text-[11px] font-bold bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#92400E]"></span> Waiting
                                  </span>
                                </td>
                              </tr>
                              <tr className="hover:bg-[#EFF6FF] transition-colors cursor-pointer" onClick={() => setActiveTab('schedule')}>
                                <td className="px-md py-sm">10:45–11:30</td>
                                <td className="px-md py-sm font-semibold">TCS</td>
                                <td className="px-md py-sm text-on-surface-variant">S0114</td>
                                <td className="px-md py-sm">Room 10</td>
                                <td className="px-md py-sm">Panel 2</td>
                                <td className="px-md py-sm">
                                  <span className="inline-flex items-center gap-xs px-2 py-0.5 rounded text-[11px] font-bold bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#92400E]"></span> Waiting
                                  </span>
                                </td>
                              </tr>
                            </>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Right Column: Next Up Panel (Sidebar) */}
                <div className="lg:col-span-1 min-h-0 shrink-0">
                  <div className="bg-surface-container-lowest border border-outline-variant rounded p-md shadow-[0px_1px_3px_rgba(0,0,0,0.1)] h-full overflow-y-auto">
                    <h3 className="font-section-heading text-section-heading text-primary font-bold mb-md border-b border-outline-variant pb-sm">Next Up</h3>
                    <div className="relative border-l border-outline-variant ml-sm mt-sm">
                      {/* Timeline Item 1 */}
                      <div className="mb-lg ml-md relative">
                        <div className="absolute w-3 h-3 bg-secondary rounded-full -left-[22px] top-1 border-2 border-surface-container-lowest"></div>
                        <div className="font-body-compact text-body-compact font-bold text-on-surface flex items-center gap-sm">
                          <span>10:45</span>
                          <span className="w-px h-3 bg-outline-variant"></span>
                          <span>TCS</span>
                        </div>
                        <div className="font-metadata text-metadata text-on-surface-variant mt-0.5">12 interviews starting</div>
                      </div>
                      {/* Timeline Item 2 */}
                      <div className="mb-lg ml-md relative">
                        <div className="absolute w-3 h-3 bg-surface-container-highest rounded-full -left-[22px] top-1 border-2 border-surface-container-lowest"></div>
                        <div className="font-body-compact text-body-compact font-bold text-on-surface flex items-center gap-sm">
                          <span>11:00</span>
                          <span className="w-px h-3 bg-outline-variant"></span>
                          <span>Infosys</span>
                        </div>
                        <div className="font-metadata text-metadata text-on-surface-variant mt-0.5">8 interviews starting</div>
                      </div>
                      {/* Timeline Item 3 */}
                      <div className="mb-lg ml-md relative">
                        <div className="absolute w-3 h-3 bg-surface-container-highest rounded-full -left-[22px] top-1 border-2 border-surface-container-lowest"></div>
                        <div className="font-body-compact text-body-compact font-bold text-on-surface flex items-center gap-sm">
                          <span>11:15</span>
                          <span className="w-px h-3 bg-outline-variant"></span>
                          <span>Amazon</span>
                        </div>
                        <div className="font-metadata text-metadata text-on-surface-variant mt-0.5">6 interviews starting</div>
                      </div>
                      {/* Timeline Item 4 */}
                      <div className="ml-md relative opacity-50">
                        <div className="absolute w-3 h-3 bg-surface-container-highest rounded-full -left-[22px] top-1 border-2 border-surface-container-lowest"></div>
                        <div className="font-body-compact text-body-compact font-bold text-on-surface flex items-center gap-sm">
                          <span>11:30</span>
                          <span className="w-px h-3 bg-outline-variant"></span>
                          <span>Break</span>
                        </div>
                        <div className="font-metadata text-metadata text-on-surface-variant mt-0.5">System-wide pause</div>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* TAB 2: SCHEDULE TIMELINE (GANTT VIEW) */}
          {activeTab === 'schedule' && (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
              {/* Page Header & Controls */}
              <div className="px-xl py-md bg-surface-container-lowest border-b border-outline-variant shrink-0">
                <h2 className="font-page-title text-page-title text-on-background mb-md">Schedule</h2>
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-md">
                  {/* Day & Date Controls */}
                  <div className="flex items-center gap-md">
                    <div className="flex bg-surface-container-low rounded-lg p-xs border border-outline-variant">
                      {[1, 2, 3, 4].map(dayNum => (
                        <button
                          key={dayNum}
                          onClick={() => setSelectedTimelineDay(dayNum)}
                          className={`px-md py-xs font-label-caps text-label-caps rounded transition-all ${selectedTimelineDay === dayNum ? 'bg-surface-container-lowest shadow-sm text-primary font-bold' : 'text-on-surface-variant hover:text-on-surface'}`}
                        >
                          DAY {dayNum}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-xs border border-outline-variant rounded-lg px-sm py-xs bg-surface-container-lowest">
                      <span className="material-symbols-outlined text-on-surface-variant text-[18px]">event</span>
                      <span className="font-body-compact text-body-compact text-on-surface">
                        {selectedTimelineDay === 1 && "Oct 23, 2026"}
                        {selectedTimelineDay === 2 && "Oct 24, 2026"}
                        {selectedTimelineDay === 3 && "Oct 25, 2026"}
                        {selectedTimelineDay === 4 && "Oct 26, 2026"}
                      </span>
                      <span className="material-symbols-outlined text-on-surface-variant text-[18px]">arrow_drop_down</span>
                    </div>
                  </div>
                  {/* View Selectors */}
                  <div className="flex bg-surface-container-low rounded-lg p-xs border border-outline-variant">
                    <button className="flex items-center gap-xs px-sm py-xs font-label-caps text-label-caps bg-surface-container-lowest shadow-sm rounded text-primary">
                      <span className="material-symbols-outlined text-[16px]">view_timeline</span>
                      TIMELINE
                    </button>
                    <button className="flex items-center gap-xs px-sm py-xs font-label-caps text-label-caps text-on-surface-variant hover:text-on-surface rounded" onClick={() => setActiveTab('rooms')}>
                      <span className="material-symbols-outlined text-[16px]">meeting_room</span>
                      ROOMS
                    </button>
                    <button className="flex items-center gap-xs px-sm py-xs font-label-caps text-label-caps text-on-surface-variant hover:text-on-surface rounded" onClick={() => setActiveTab('companies')}>
                      <span className="material-symbols-outlined text-[16px]">business</span>
                      COMPANIES
                    </button>
                    <button className="flex items-center gap-xs px-sm py-xs font-label-caps text-label-caps text-on-surface-variant hover:text-on-surface rounded" onClick={() => setActiveTab('students')}>
                      <span className="material-symbols-outlined text-[16px]">school</span>
                      STUDENTS
                    </button>
                  </div>
                </div>
              </div>

              {/* Main Scheduling Area */}
              <div className="flex-1 flex overflow-hidden relative">
                {/* Grid Container */}
                <div className="flex-1 overflow-auto grid-scroll bg-surface-container-lowest">
                  <div className="min-w-[1200px] h-full relative">
                    
                    {/* Time Header (Sticky Top) */}
                    <div className="sticky top-0 z-10 flex bg-surface-container-lowest border-b border-outline-variant h-10 shadow-sm shrink-0">
                      <div className="w-24 shrink-0 border-r border-outline-variant bg-surface-container-low"></div>
                      <div className="flex-1 flex relative">
                        {timeSlots.map((minutes, idx) => (
                          <div 
                            key={minutes} 
                            style={{ left: `${(idx / (timeSlots.length - 1)) * 100}%` }}
                            className="absolute top-0 bottom-0 w-px border-r border-outline-variant flex items-center justify-start pl-sm text-metadata font-metadata text-on-surface-variant"
                          >
                            <span>{formatTime(minutes)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Room Rows */}
                    <div className="flex flex-col relative bg-surface-container-lowest">
                      {rooms.map(room => {
                        const roomInterviews = interviews.filter(
                          iv => iv.status === 'SCHEDULED' && iv.room_id === room.id && iv.day === selectedTimelineDay
                        );

                        return (
                          <div key={room.id} className="flex h-20 border-b border-outline-variant hover:bg-surface-container-low transition-colors group relative shrink-0">
                            {/* Sticky Left Room Name column */}
                            <div className="w-24 shrink-0 sticky left-0 z-10 bg-surface-container-lowest border-r border-outline-variant flex flex-col items-center justify-center group-hover:bg-surface-container-low">
                              <span className="font-label-caps text-label-caps text-on-surface">ROOM 0{room.id}</span>
                              <span className="font-metadata text-metadata text-on-surface-variant">Cap: {room.capacity}</span>
                            </div>

                            {/* Timeline blocks row */}
                            <div className="flex-1 relative h-full">
                              {/* Background dash lines for every 30m */}
                              <div className="absolute inset-0 flex pointer-events-none">
                                {timeSlots.map((minutes, idx) => (
                                  <div 
                                    key={minutes} 
                                    style={{ left: `${(idx / (timeSlots.length - 1)) * 100}%` }}
                                    className="absolute top-0 bottom-0 w-px border-r border-outline-variant border-dashed opacity-50"
                                  ></div>
                                ))}
                              </div>

                              {/* Mapped dynamic interview blocks */}
                              {roomInterviews.map(iv => {
                                const start = iv.start_time || 540;
                                const end = iv.end_time || 585;
                                
                                const leftPercent = ((start - 540) / 480) * 100;
                                const widthPercent = ((end - start) / 480) * 100;
                                
                                const comp = companies.find(c => c.id === iv.company_id);
                                const stud = students.find(s => s.id === iv.student_id);
                                const isSelected = selectedInterview && selectedInterview.id === iv.id;

                                // Material design block styles matching selected / unselected colors
                                const blockStyle = isSelected
                                  ? 'bg-primary-fixed border border-primary-fixed-dim ring-2 ring-primary z-10 text-on-primary-fixed'
                                  : 'bg-secondary-fixed border border-secondary-fixed-dim text-on-secondary-fixed';

                                return (
                                  <div 
                                    key={iv.id} 
                                    onClick={() => setSelectedInterview(iv)}
                                    style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
                                    className={`absolute top-2 bottom-2 rounded shadow-sm p-sm cursor-pointer hover:shadow-md transition-shadow ${blockStyle}`}
                                  >
                                    <div className="flex justify-between items-start mb-xs">
                                      <span className="font-label-caps text-label-caps truncate pr-xs">{comp?.name || iv.company_id}</span>
                                      <span className="font-metadata text-metadata opacity-70">{formatTime(start)}-{formatTime(end)}</span>
                                    </div>
                                    <div className="flex justify-between items-end">
                                      <span className="font-body-compact text-body-compact font-bold truncate pr-xs">{stud?.name || iv.student_id}</span>
                                      <span className="font-metadata text-metadata bg-surface-container-lowest text-on-surface px-1 rounded shrink-0">P0{iv.panel_index}</span>
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
                </div>

                {/* Right Detail Drawer */}
                {selectedInterview && (
                  <aside className="w-[400px] border-l border-outline-variant bg-surface-container-lowest shadow-[-4px_0_15px_rgba(0,0,0,0.05)] z-20 flex flex-col shrink-0">
                    {/* Drawer Header */}
                    <div className="px-md py-sm border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
                      <h3 className="font-section-heading text-section-heading text-on-surface font-bold">Interview Details</h3>
                      <button onClick={() => setSelectedInterview(null)} className="p-xs hover:bg-surface-container-high rounded text-on-surface-variant transition-colors">
                        <span className="material-symbols-outlined text-[20px]">close</span>
                      </button>
                    </div>
                    {/* Drawer Content */}
                    <div className="flex-1 overflow-y-auto p-md flex flex-col gap-lg font-body-compact text-body-compact">
                      {/* Header Info */}
                      <div>
                        <div className="flex justify-between items-start mb-xs">
                          <span className="font-metadata text-metadata text-on-surface-variant">ID: INT-{selectedInterview.id}</span>
                          <span className={`font-label-caps text-label-caps px-sm py-[2px] rounded font-bold ${selectedInterview.status === 'SCHEDULED' ? 'bg-[#DCFCE7] text-[#15803D]' : 'bg-[#ffdad6] text-[#93000a]'}`}>
                            {selectedInterview.status}
                          </span>
                        </div>
                        <h4 className="font-page-title text-[20px] leading-tight text-on-surface font-bold">
                          {companies.find(c => c.id === selectedInterview.company_id)?.name || selectedInterview.company_id} - Technical R1
                        </h4>
                        <p className="font-body-compact text-body-compact text-on-surface-variant mt-xs">
                          Today, {formatTime(selectedInterview.start_time)} - {formatTime(selectedInterview.end_time)} ({selectedInterview.end_time! - selectedInterview.start_time!}m)
                        </p>
                      </div>

                      {/* Entity Cards */}
                      <div className="grid grid-cols-2 gap-sm">
                        {/* Student */}
                        {(() => {
                          const stud = students.find(s => s.id === selectedInterview.student_id);
                          const initials = stud ? stud.name.split(' ').map(n => n[0]).join('').toUpperCase() : 'ST';
                          return (
                            <div className="border border-outline-variant rounded p-sm bg-surface-container-lowest flex items-start gap-sm">
                              <div className="w-8 h-8 rounded bg-tertiary-fixed text-on-tertiary-fixed flex items-center justify-center font-bold font-body-compact shrink-0">
                                {initials}
                              </div>
                              <div className="min-w-0">
                                <p className="font-label-caps text-label-caps text-on-surface-variant mb-[2px] font-bold">STUDENT</p>
                                <p className="font-body-compact text-body-compact font-bold text-on-surface truncate">{stud?.name || selectedInterview.student_id}</p>
                                <p className="font-metadata text-metadata text-on-surface-variant truncate">{stud?.id} • {stud?.cgpa} CGPA</p>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Panel */}
                        <div className="border border-outline-variant rounded p-sm bg-surface-container-lowest flex items-start gap-sm">
                          <div className="w-8 h-8 rounded bg-secondary-fixed text-on-secondary-fixed flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-[18px]">person_search</span>
                          </div>
                          <div className="min-w-0">
                            <p className="font-label-caps text-label-caps text-on-surface-variant mb-[2px] font-bold">PANEL</p>
                            <p className="font-body-compact text-body-compact font-bold text-on-surface">Panel 0{selectedInterview.panel_index}</p>
                            <p className="font-metadata text-metadata text-on-surface-variant">2 Interviewers</p>
                          </div>
                        </div>
                      </div>

                      {/* Location */}
                      <div className="border border-outline-variant rounded p-sm bg-surface-container-lowest flex items-center justify-between">
                        <div className="flex items-center gap-sm min-w-0">
                          <span className="material-symbols-outlined text-on-surface-variant shrink-0">meeting_room</span>
                          <div className="min-w-0">
                            <p className="font-body-compact text-body-compact font-bold text-on-surface">Room 0{selectedInterview.room_id}</p>
                            <p className="font-metadata text-metadata text-on-surface-variant truncate">Main Block, Ground Fl</p>
                          </div>
                        </div>
                        <button className="text-secondary font-label-caps text-label-caps hover:underline shrink-0" onClick={() => { setActiveTab('replans'); setSelectedInterview(null); }}>CHANGE</button>
                      </div>

                      {/* Schedule Explanation */}
                      <div>
                        <h5 className="font-section-heading text-body-base text-on-surface mb-sm border-b border-outline-variant pb-xs">Schedule Explanation</h5>
                        <ul className="flex flex-col gap-xs">
                          <li className="flex items-center gap-sm">
                            <span className="material-symbols-outlined text-[16px] text-[#15803D] fill-icon">check_circle</span>
                            <span className="font-body-compact text-body-compact text-on-surface">Student eligible for company</span>
                          </li>
                          <li className="flex items-center gap-sm">
                            <span className="material-symbols-outlined text-[16px] text-[#15803D] fill-icon">check_circle</span>
                            <span className="font-body-compact text-body-compact text-on-surface">Panel available in slot</span>
                          </li>
                          <li className="flex items-center gap-sm">
                            <span className="material-symbols-outlined text-[16px] text-[#15803D] fill-icon">check_circle</span>
                            <span className="font-body-compact text-body-compact text-on-surface">Room available</span>
                          </li>
                          <li className="flex items-center gap-sm">
                            <span className="material-symbols-outlined text-[16px] text-[#15803D] fill-icon">check_circle</span>
                            <span className="font-body-compact text-body-compact text-on-surface">No student conflict (prev/next buffer OK)</span>
                          </li>
                          <li className="flex items-center gap-sm">
                            <span className="material-symbols-outlined text-[16px] text-[#15803D] fill-icon">check_circle</span>
                            <span className="font-body-compact text-body-compact text-on-surface">Company slot available</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                    {/* Drawer Actions */}
                    <div className="p-md border-t border-outline-variant bg-surface-container-lowest flex gap-sm shrink-0">
                      <button className="flex-1 py-xs px-sm border border-outline-variant rounded text-on-surface font-label-caps text-label-caps hover:bg-surface-container-low transition-colors" onClick={() => setActiveTab('replans')}>EDIT</button>
                      <button className="flex-1 py-xs px-sm bg-primary-container text-on-primary rounded font-label-caps text-label-caps hover:opacity-90 transition-opacity">START INT</button>
                    </div>
                  </aside>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: INTERVIEWS LIST */}
          {activeTab === 'interviews' && (
            <div className="flex-1 flex flex-col min-h-0 bg-background">
              
              {/* Page Header */}
              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-md mb-xl shrink-0">
                <div>
                  <h2 className="font-page-title text-page-title text-on-surface mb-xs">Interviews</h2>
                  <p className="font-body-base text-body-base text-on-surface-variant">Placement Week · Day {selectedTimelineDay || 2}</p>
                </div>
                <div className="flex items-center gap-sm">
                  <div className="relative w-full lg:w-80">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">search</span>
                    <input 
                      className="w-full pl-10 pr-3 py-2 bg-surface-container-lowest rounded border border-outline-variant text-body-compact font-body-compact focus:outline-none focus:border-primary-container focus:ring-1 focus:ring-primary-container text-on-surface placeholder:text-on-surface-variant shadow-sm" 
                      placeholder="Search interview ID, student, or company..." 
                      type="text"
                      value={searchQuery}
                      onChange={(e) => { setSearchQuery(e.target.value); setInterviewsCurrentPage(1); }}
                    />
                  </div>
                  <button 
                    onClick={() => setShowInterviewsFilters(!showInterviewsFilters)}
                    className={`flex items-center gap-xs px-sm py-2 border rounded text-body-compact font-body-compact font-semibold shadow-sm whitespace-nowrap transition-colors ${showInterviewsFilters ? 'bg-primary-container text-on-primary-container border-primary-container' : 'bg-surface-container-lowest border-outline-variant text-on-surface hover:bg-surface-container'}`}
                  >
                    <span className="material-symbols-outlined text-[18px]">filter_list</span>
                    Filters
                  </button>
                </div>
              </div>

              {/* Expandable Filters Panel */}
              {showInterviewsFilters && (
                <div className="p-md border border-outline-variant rounded-lg bg-surface-container-low flex flex-wrap gap-md mb-md shrink-0 transition-all duration-300">
                  {/* Day Filter */}
                  <div className="flex flex-col gap-xs">
                    <span className="text-[11px] font-bold text-on-surface-variant uppercase">Day Filter</span>
                    <select 
                      className="border border-outline-variant rounded text-[13px] bg-surface px-sm py-xs min-w-[120px] focus:ring-1 focus:ring-secondary focus:border-secondary"
                      value={filterDay}
                      onChange={(e) => { setFilterDay(e.target.value); setInterviewsCurrentPage(1); }}
                    >
                      <option value="all">All Days</option>
                      <option value="1">Day 1</option>
                      <option value="2">Day 2</option>
                      <option value="3">Day 3</option>
                      <option value="4">Day 4</option>
                    </select>
                  </div>

                  {/* Company Filter */}
                  <div className="flex flex-col gap-xs">
                    <span className="text-[11px] font-bold text-on-surface-variant uppercase">Company Filter</span>
                    <select 
                      className="border border-outline-variant rounded text-[13px] bg-surface px-sm py-xs min-w-[180px] focus:ring-1 focus:ring-secondary focus:border-secondary"
                      value={filterCompany}
                      onChange={(e) => { setFilterCompany(e.target.value); setInterviewsCurrentPage(1); }}
                    >
                      <option value="all">All Companies</option>
                      {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  {/* Status Filter */}
                  <div className="flex flex-col gap-xs">
                    <span className="text-[11px] font-bold text-on-surface-variant uppercase">Status Filter</span>
                    <select 
                      className="border border-outline-variant rounded text-[13px] bg-surface px-sm py-xs min-w-[150px] focus:ring-1 focus:ring-secondary focus:border-secondary"
                      value={filterStatus}
                      onChange={(e) => { setFilterStatus(e.target.value); setInterviewsCurrentPage(1); }}
                    >
                      <option value="all">All Statuses</option>
                      <option value="SCHEDULED">Scheduled</option>
                      <option value="UNSCHEDULED">Unscheduled</option>
                    </select>
                  </div>

                  {/* Clear button */}
                  <div className="flex items-end">
                    <button 
                      onClick={() => { setFilterDay('all'); setFilterCompany('all'); setFilterStatus('all'); setInterviewsCurrentPage(1); }}
                      className="px-sm py-xs bg-surface-container-lowest border border-outline-variant rounded text-xs hover:bg-surface-container-high transition-colors"
                    >
                      Clear Filters
                    </button>
                  </div>
                </div>
              )}

              {/* Tabs */}
              <div className="border-b border-outline-variant mb-lg overflow-x-auto no-scrollbar shrink-0">
                <nav className="flex gap-lg min-w-max">
                  <button 
                    onClick={() => { setInterviewStatusSubTab('all'); setInterviewsCurrentPage(1); }}
                    className={`border-b-2 py-2 px-1 font-section-heading text-body-base whitespace-nowrap transition-colors ${interviewStatusSubTab === 'all' ? 'border-primary-container text-primary-container font-semibold' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
                  >
                    All <span className="bg-surface-container-highest text-on-surface px-1.5 py-0.5 rounded-full text-[10px] ml-xs">{filteredInterviews.length}</span>
                  </button>
                  <button 
                    onClick={() => { setInterviewStatusSubTab('scheduled'); setInterviewsCurrentPage(1); }}
                    className={`border-b-2 py-2 px-1 font-body-base text-body-base whitespace-nowrap transition-colors ${interviewStatusSubTab === 'scheduled' ? 'border-primary-container text-primary-container font-semibold' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
                  >
                    Scheduled <span className="bg-surface-container-low text-on-surface-variant px-1.5 py-0.5 rounded-full text-[10px] ml-xs">
                      {filteredInterviews.filter(iv => iv.status === 'SCHEDULED').length}
                    </span>
                  </button>
                  <button 
                    onClick={() => { setInterviewStatusSubTab('inprogress'); setInterviewsCurrentPage(1); }}
                    className={`border-b-2 py-2 px-1 font-body-base text-body-base whitespace-nowrap transition-colors ${interviewStatusSubTab === 'inprogress' ? 'border-primary-container text-primary-container font-semibold' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
                  >
                    In Progress <span className="bg-secondary-fixed text-secondary px-1.5 py-0.5 rounded-full text-[10px] ml-xs">
                      {filteredInterviews.filter(iv => iv.status === 'SCHEDULED' && (iv.id.charCodeAt(iv.id.length - 1) % 13 === 0)).length}
                    </span>
                  </button>
                  <button 
                    onClick={() => { setInterviewStatusSubTab('concluded'); setInterviewsCurrentPage(1); }}
                    className={`border-b-2 py-2 px-1 font-body-base text-body-base whitespace-nowrap transition-colors ${interviewStatusSubTab === 'concluded' ? 'border-primary-container text-primary-container font-semibold' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
                  >
                    Concluded <span className="bg-[#DCFCE7] text-[#15803D] px-1.5 py-0.5 rounded-full text-[10px] ml-xs">
                      {filteredInterviews.filter(iv => iv.status === 'SCHEDULED' && (iv.id.charCodeAt(iv.id.length - 1) % 11 === 0)).length}
                    </span>
                  </button>
                  <button 
                    onClick={() => { setInterviewStatusSubTab('cancelled'); setInterviewsCurrentPage(1); }}
                    className={`border-b-2 py-2 px-1 font-body-base text-body-base whitespace-nowrap transition-colors ${interviewStatusSubTab === 'cancelled' ? 'border-primary-container text-primary-container font-semibold' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
                  >
                    Cancelled <span className="bg-surface-container-low text-on-surface-variant px-1.5 py-0.5 rounded-full text-[10px] ml-xs">
                      {filteredInterviews.filter(iv => iv.status === 'CANCELLED').length}
                    </span>
                  </button>
                </nav>
              </div>

              {/* Data Table Container */}
              {(() => {
                const subFilteredInterviews = filteredInterviews.filter(iv => {
                  if (interviewStatusSubTab === 'scheduled') return iv.status === 'SCHEDULED';
                  if (interviewStatusSubTab === 'inprogress') return iv.status === 'SCHEDULED' && (iv.id.charCodeAt(iv.id.length - 1) % 13 === 0);
                  if (interviewStatusSubTab === 'concluded') return iv.status === 'SCHEDULED' && (iv.id.charCodeAt(iv.id.length - 1) % 11 === 0);
                  if (interviewStatusSubTab === 'cancelled') return iv.status === 'CANCELLED';
                  return true;
                });

                const pageSize = 10;
                const totalItems = subFilteredInterviews.length;
                const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
                const activePage = Math.min(interviewsCurrentPage, totalPages);
                
                const startIndex = (activePage - 1) * pageSize;
                const paginatedInterviews = subFilteredInterviews.slice(startIndex, startIndex + pageSize);

                return (
                  <div className="bg-surface-container-lowest border border-outline-variant rounded-lg overflow-hidden flex flex-col shadow-sm flex-1 min-h-0">
                    <div className="overflow-auto flex-1">
                      <table className="w-full text-left border-collapse min-w-[900px]">
                        <thead>
                          <tr className="bg-[#F9FAFB] border-b border-outline-variant text-on-surface-variant font-label-caps text-label-caps uppercase sticky top-0 z-10">
                            <th className="px-md py-sm font-semibold w-24">ID</th>
                            <th className="px-md py-sm font-semibold w-32">Time</th>
                            <th className="px-md py-sm font-semibold">Company</th>
                            <th className="px-md py-sm font-semibold">Student</th>
                            <th className="px-md py-sm font-semibold w-24">Room</th>
                            <th className="px-md py-sm font-semibold w-24">Panel</th>
                            <th className="px-md py-sm font-semibold w-32">Status</th>
                            <th className="px-md py-sm font-semibold w-12 text-center"></th>
                          </tr>
                        </thead>
                        <tbody className="font-body-compact text-body-compact divide-y divide-[#F3F4F6]">
                          {paginatedInterviews.map((iv) => {
                            const comp = companies.find(c => c.id === iv.company_id);
                            const stud = students.find(s => s.id === iv.student_id);

                            let statusText = iv.status === 'SCHEDULED' ? 'Scheduled' : 'Unscheduled';
                            let badgeStyle = "bg-surface-container-high text-on-surface-variant";
                            
                            if (iv.status === 'SCHEDULED') {
                              if (iv.id.charCodeAt(iv.id.length - 1) % 13 === 0) {
                                statusText = "In Progress";
                                badgeStyle = "bg-[#DBEAFE] text-[#1E40AF]";
                              } else if (iv.id.charCodeAt(iv.id.length - 1) % 11 === 0) {
                                statusText = "Concluded";
                                badgeStyle = "bg-[#DCFCE7] text-[#15803D]";
                              } else if (iv.id.charCodeAt(iv.id.length - 1) % 15 === 0) {
                                statusText = "Delayed";
                                badgeStyle = "bg-[#FEF3C7] text-[#B45309]";
                              }
                            } else if (iv.status === 'CANCELLED') {
                              statusText = "Cancelled";
                              badgeStyle = "bg-surface-container-low text-on-surface-variant";
                            }

                            return (
                              <tr 
                                key={iv.id} 
                                className="hover:bg-[#EFF6FF] group transition-colors cursor-pointer"
                                onClick={() => { setSelectedInterview(iv); setSelectedTimelineDay(iv.day || 1); setActiveTab('schedule'); }}
                              >
                                <td className="px-md py-sm font-metadata text-metadata text-on-surface-variant">{iv.id}</td>
                                <td className="px-md py-sm whitespace-nowrap">
                                  {iv.status === 'SCHEDULED' ? `Day ${iv.day} @ ${formatTime(iv.start_time)}–${formatTime(iv.end_time)}` : 'N/A'}
                                </td>
                                <td className="px-md py-sm">
                                  <div className="flex items-center gap-xs">
                                    <span className="font-medium text-on-surface">{comp?.name || iv.company_id}</span>
                                    {comp && (
                                      <span className="px-1.5 py-0.5 bg-surface-container-highest text-on-surface-variant rounded text-[10px] font-medium leading-none">
                                        Tier {comp.priority_tier}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-md py-sm">
                                  <div className="flex flex-col">
                                    <span className="font-medium text-on-surface">{stud?.name || iv.student_id}</span>
                                    <span className="text-on-surface-variant text-[11px]">{stud?.id || iv.student_id}</span>
                                  </div>
                                </td>
                                <td className="px-md py-sm text-on-surface-variant">{iv.room_id ? `Room 0${iv.room_id}` : '-'}</td>
                                <td className="px-md py-sm text-on-surface-variant">{iv.panel_index ? `Panel ${iv.panel_index}` : '-'}</td>
                                <td className="px-md py-sm">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${badgeStyle}`}>
                                    {statusText}
                                  </span>
                                </td>
                                <td className="px-md py-sm text-right">
                                  <button className="text-on-surface-variant hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                                    <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                          {paginatedInterviews.length === 0 && (
                            <tr>
                              <td colSpan={8} className="text-center py-lg text-on-surface-variant">No interviews match the current filter selection.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination Footer */}
                    <div className="border-t border-outline-variant px-md py-3 flex items-center justify-between bg-surface-container-lowest shrink-0">
                      <span className="text-metadata font-metadata text-on-surface-variant">
                        Showing {startIndex + 1} to {Math.min(startIndex + pageSize, totalItems)} of {totalItems} entries
                      </span>
                      <div className="flex items-center gap-xs">
                        <button 
                          className="p-1 rounded text-outline hover:bg-surface-container hover:text-on-surface disabled:opacity-50"
                          disabled={activePage === 1}
                          onClick={() => setInterviewsCurrentPage(p => Math.max(1, p - 1))}
                        >
                          <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                        </button>
                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                          .filter(page => page === 1 || page === totalPages || Math.abs(page - activePage) <= 1)
                          .map((page, idx, arr) => {
                            const prev = arr[idx - 1];
                            const showEllipsis = prev && page - prev > 1;
                            return (
                              <Fragment key={page}>
                                {showEllipsis && <span className="text-on-surface-variant text-body-compact px-xs">...</span>}
                                <button 
                                  onClick={() => setInterviewsCurrentPage(page)}
                                  className={`w-7 h-7 rounded text-body-compact font-medium flex items-center justify-center transition-colors ${activePage === page ? 'bg-primary-container text-on-primary' : 'text-on-surface-variant hover:bg-surface-container'}`}
                                >
                                  {page}
                                </button>
                              </Fragment>
                            );
                          })}
                        <button 
                          className="p-1 rounded text-outline hover:bg-surface-container hover:text-on-surface disabled:opacity-50"
                          disabled={activePage === totalPages}
                          onClick={() => setInterviewsCurrentPage(p => Math.min(totalPages, p + 1))}
                        >
                          <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* TAB 4: COMPANIES MANAGEMENT */}
          {activeTab === 'companies' && (
            <div className="flex-1 flex flex-col min-h-0 bg-background overflow-y-auto pr-sm gap-lg relative">
              
              {/* Page Header */}
              <div className="mb-md shrink-0">
                <h2 className="font-page-title text-page-title text-on-surface">Companies</h2>
                <p className="font-metadata text-metadata text-on-surface-variant mt-1">Placement Week · Day {selectedTimelineDay}</p>
              </div>

              {/* KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-md mb-xl shrink-0">
                {/* KPI 1 */}
                <div className="bg-surface-container-lowest border border-outline-variant rounded p-md shadow-[0_1px_3px_rgba(0,0,0,0.1)] relative">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-metadata text-metadata text-on-surface-variant uppercase tracking-wider mb-1">Total Companies</p>
                      <p className="font-page-title text-page-title text-on-surface font-bold">{companies.length}</p>
                    </div>
                    <span className="material-symbols-outlined text-outline">business</span>
                  </div>
                </div>
                {/* KPI 2 */}
                <div className="bg-surface-container-lowest border border-outline-variant rounded p-md shadow-[0_1px_3px_rgba(0,0,0,0.1)] relative">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-metadata text-metadata text-on-surface-variant uppercase tracking-wider mb-1">Active Today</p>
                      <p className="font-page-title text-page-title text-on-surface font-bold">
                        {companies.filter(c => interviews.some(iv => iv.company_id === c.id && iv.day === selectedTimelineDay && iv.status === 'SCHEDULED')).length}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 bg-[#DCFCE7] text-[#15803D] px-2 py-1 rounded-sm font-metadata text-metadata font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#15803D] animate-pulse"></span>
                      Live
                    </span>
                  </div>
                </div>
                {/* KPI 3 */}
                <div className="bg-surface-container-lowest border border-outline-variant rounded p-md shadow-[0_1px_3px_rgba(0,0,0,0.1)] relative">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-metadata text-metadata text-on-surface-variant uppercase tracking-wider mb-1">Total Panels</p>
                      <p className="font-page-title text-page-title text-on-surface font-bold">
                        {companies.reduce((sum, c) => sum + c.panel_count, 0)}
                      </p>
                    </div>
                    <span className="material-symbols-outlined text-outline">meeting_room</span>
                  </div>
                </div>
              </div>

              {/* Data Table Section */}
              <div className="bg-surface-container-lowest border border-outline-variant rounded shadow-[0_1px_3px_rgba(0,0,0,0.1)] overflow-hidden flex flex-col flex-grow min-h-0">
                {/* Table Toolbar */}
                <div className="p-md border-b border-outline-variant flex justify-between items-center bg-surface-bright shrink-0">
                  <h3 className="font-section-heading text-section-heading text-on-surface font-bold">Company Logistics Directory</h3>
                  <div className="flex gap-sm">
                    <button 
                      onClick={() => setShowCompaniesFilters(!showCompaniesFilters)}
                      className={`flex items-center gap-2 px-3 py-1.5 border rounded font-body-compact text-body-compact transition-colors ${showCompaniesFilters ? 'bg-primary-container text-on-primary-container border-primary-container' : 'bg-surface-container-lowest border-outline-variant text-on-surface hover:bg-surface-container-high'}`}
                    >
                      <span className="material-symbols-outlined text-[18px]">filter_list</span>
                      Filters
                    </button>
                    <button 
                      onClick={() => setShowAddCompanyForm(true)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-primary-container text-on-primary rounded hover:opacity-90 transition-opacity font-body-compact text-body-compact shadow-sm"
                    >
                      <span className="material-symbols-outlined text-[18px]">add</span>
                      New Entry
                    </button>
                  </div>
                </div>

                {/* Optional Filters Panel */}
                {showCompaniesFilters && (
                  <div className="p-md border-b border-outline-variant bg-surface-container-low flex flex-wrap gap-md shrink-0">
                    <div className="flex flex-col gap-xs">
                      <span className="text-[11px] font-bold text-on-surface-variant uppercase">Recruiter Priority Tier</span>
                      <select 
                        className="border border-outline-variant rounded text-[13px] bg-surface px-sm py-xs min-w-[150px] focus:ring-1 focus:ring-secondary focus:border-secondary"
                        value={filterCompanyTier}
                        onChange={(e) => setFilterCompanyTier(e.target.value)}
                      >
                        <option value="all">All Tiers</option>
                        <option value="1">Tier 1</option>
                        <option value="2">Tier 2</option>
                        <option value="3">Tier 3</option>
                      </select>
                    </div>
                    <div className="flex items-end">
                      <button 
                        onClick={() => { setFilterCompanyTier('all'); }}
                        className="px-sm py-xs bg-surface-container-lowest border border-outline-variant rounded text-xs hover:bg-surface-container-high transition-colors"
                      >
                        Reset Filters
                      </button>
                    </div>
                  </div>
                )}

                {/* Table container */}
                <div className="overflow-auto flex-grow">
                  <table className="w-full text-left border-collapse min-w-[900px]">
                    <thead>
                      <tr className="bg-[#F9FAFB] border-b border-outline-variant sticky top-0 z-10 font-label-caps text-label-caps text-on-surface-variant uppercase">
                        <th className="py-2 px-3 font-semibold w-[250px]">Company</th>
                        <th className="py-2 px-3 font-semibold">Priority</th>
                        <th className="py-2 px-3 font-semibold">Cutoff</th>
                        <th className="py-2 px-3 font-semibold text-center">Panels</th>
                        <th className="py-2 px-3 font-semibold">Duration</th>
                        <th className="py-2 px-3 font-semibold text-right">Shortlisted</th>
                        <th className="py-2 px-3 font-semibold text-right">Scheduled</th>
                        <th className="py-2 px-3 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="font-body-compact text-body-compact text-on-surface divide-y divide-[#F3F4F6]">
                      {filteredCompanies.map(c => {
                        // Dynamically assign domains and logos
                        let domain = "Technology";
                        let icon = "data_usage";
                        if (c.name.toLowerCase().includes("quant") || c.name.toLowerCase().includes("goldman") || c.name.toLowerCase().includes("capital") || c.name.toLowerCase().includes("sachs")) {
                          domain = "Finance / HFT";
                          icon = "account_balance";
                        } else if (c.name.toLowerCase().includes("nexus") || c.name.toLowerCase().includes("systems") || c.name.toLowerCase().includes("soft") || c.name.toLowerCase().includes("google") || c.name.toLowerCase().includes("microsoft") || c.name.toLowerCase().includes("amazon")) {
                          domain = "Software Eng";
                          icon = "code";
                        } else if (c.name.toLowerCase().includes("aero") || c.name.toLowerCase().includes("factory") || c.name.toLowerCase().includes("motor") || c.name.toLowerCase().includes("tcs") || c.name.toLowerCase().includes("infosys")) {
                          domain = "Core / Consulting";
                          icon = "factory";
                        }

                        const scheduledCount = interviews.filter(iv => iv.company_id === c.id && iv.status === 'SCHEDULED').length;
                        const scheduledToday = interviews.filter(iv => iv.company_id === c.id && iv.day === selectedTimelineDay && iv.status === 'SCHEDULED').length;
                        const shortlisted = c.priority_tier === 1 ? 120 + (c.id.charCodeAt(0) % 20) * 10 : 60 + (c.id.charCodeAt(0) % 15) * 5;

                        // Dynamic status badge setup
                        let statusText = "Active";
                        let badgeStyle = "bg-[#DCFCE7] text-[#15803D] border-[#bbf7d0]";
                        
                        if (c.id === delayCompany) {
                          statusText = "Delayed";
                          badgeStyle = "bg-[#FEF9C3] text-[#A16207] border-[#fef08a]";
                        } else if (scheduledToday === 0) {
                          statusText = "Completed";
                          badgeStyle = "bg-[#F3F4F6] text-[#374151] border-[#e5e7eb]";
                        }

                        return (
                          <tr key={c.id} className="hover:bg-[#EFF6FF] transition-colors group cursor-pointer" onClick={() => { setActiveTab('schedule'); setSelectedTimelineDay(selectedTimelineDay); }}>
                            <td className="py-2 px-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded bg-surface-container flex items-center justify-center border border-outline-variant overflow-hidden shrink-0">
                                  <span className="material-symbols-outlined text-outline">{icon}</span>
                                </div>
                                <div className="min-w-0">
                                  <p className="font-bold truncate">{c.name}</p>
                                  <p className="text-[11px] text-on-surface-variant truncate">{domain}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-2 px-3">Tier {c.priority_tier}</td>
                            <td className="py-2 px-3">{c.cgpa_cutoff.toFixed(2)}</td>
                            <td className="py-2 px-3 text-center">{c.panel_count}</td>
                            <td className="py-2 px-3">{c.interview_duration} min</td>
                            <td className="py-2 px-3 text-right">{shortlisted}</td>
                            <td className="py-2 px-3 text-right">{scheduledCount}</td>
                            <td className="py-2 px-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${badgeStyle}`}>
                                {statusText}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                      {filteredCompanies.length === 0 && (
                        <tr>
                          <td colSpan={8} className="text-center py-lg text-on-surface-variant">No recruiters match current search filters.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Add New Company Slider Drawer Overlay */}
              {showAddCompanyForm && (
                <div className="fixed inset-0 bg-black/30 z-50 flex justify-end transition-opacity duration-300">
                  {/* Click outside to close */}
                  <div className="flex-1" onClick={() => setShowAddCompanyForm(false)}></div>
                  <aside className="w-[450px] bg-surface-container-lowest shadow-2xl flex flex-col h-full border-l border-outline-variant animate-slide-in p-md font-body-compact text-body-compact">
                    {/* Drawer Header */}
                    <div className="flex justify-between items-center border-b border-outline-variant pb-sm mb-md shrink-0">
                      <div>
                        <h3 className="font-section-heading text-[18px] text-primary font-bold">New Recruiter Logistics</h3>
                        <p className="text-xs text-on-surface-variant">Add recruiter parameter settings to local state.</p>
                      </div>
                      <button onClick={() => setShowAddCompanyForm(false)} className="p-sm hover:bg-surface-container-high rounded text-on-surface-variant">
                        <span className="material-symbols-outlined text-[20px]">close</span>
                      </button>
                    </div>

                    {/* Drawer Form Content */}
                    <form 
                      onSubmit={(e) => {
                        e.preventDefault();
                        const nextId = `C${String(companies.length + 1).padStart(3, '0')}`;
                        const newC = {
                          id: nextId,
                          name: newCompanyName,
                          priority_tier: Number(newCompanyTier),
                          cgpa_cutoff: Number(newCompanyCutoff),
                          interview_duration: Number(newCompanyDuration),
                          panel_count: Number(newCompanyPanels),
                          preferred_days: newCompanyDays === 'All Days' ? undefined : newCompanyDays
                        };
                        setCompanies([...companies, newC]);
                        setNewCompanyName('');
                        setShowAddCompanyForm(false);
                      }}
                      className="flex-1 overflow-y-auto flex flex-col gap-md"
                    >
                      {/* Name */}
                      <div className="flex flex-col gap-xs">
                        <label className="text-xs font-bold text-on-surface-variant uppercase">Company Name *</label>
                        <input 
                          required
                          className="border border-outline-variant rounded p-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none" 
                          placeholder="e.g. Mirai Software Corp" 
                          type="text"
                          value={newCompanyName}
                          onChange={(e) => setNewCompanyName(e.target.value)}
                        />
                      </div>

                      {/* Domain */}
                      <div className="flex flex-col gap-xs">
                        <label className="text-xs font-bold text-on-surface-variant uppercase">Domain</label>
                        <select 
                          className="border border-outline-variant rounded p-sm bg-surface focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                          value={newCompanyDomain}
                          onChange={(e) => setNewCompanyDomain(e.target.value)}
                        >
                          <option value="Software Eng">Software Eng</option>
                          <option value="Finance / HFT">Finance / HFT</option>
                          <option value="Core / Consulting">Core / Consulting</option>
                          <option value="Technology">Technology</option>
                        </select>
                      </div>

                      {/* Priority Tier */}
                      <div className="flex flex-col gap-xs">
                        <label className="text-xs font-bold text-on-surface-variant uppercase">Priority Tier</label>
                        <div className="flex gap-md mt-xs">
                          {['1', '2', '3'].map(tier => (
                            <label key={tier} className="flex items-center gap-xs cursor-pointer">
                              <input 
                                className="text-primary focus:ring-primary"
                                type="radio" 
                                name="priority_tier"
                                checked={newCompanyTier === tier}
                                onChange={() => setNewCompanyTier(tier)}
                              />
                              <span>Tier {tier}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* Cutoff */}
                      <div className="flex flex-col gap-xs">
                        <label className="text-xs font-bold text-on-surface-variant uppercase">Minimum CGPA Cutoff</label>
                        <input 
                          className="border border-outline-variant rounded p-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none" 
                          type="number"
                          step="0.01"
                          min="0"
                          max="10"
                          value={newCompanyCutoff}
                          onChange={(e) => setNewCompanyCutoff(e.target.value)}
                        />
                      </div>

                      {/* Duration */}
                      <div className="flex flex-col gap-xs">
                        <label className="text-xs font-bold text-on-surface-variant uppercase">Interview Duration (minutes)</label>
                        <input 
                          className="border border-outline-variant rounded p-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none" 
                          type="number"
                          min="15"
                          step="15"
                          value={newCompanyDuration}
                          onChange={(e) => setNewCompanyDuration(e.target.value)}
                        />
                      </div>

                      {/* Panels */}
                      <div className="flex flex-col gap-xs">
                        <label className="text-xs font-bold text-on-surface-variant uppercase">Panels Allocated</label>
                        <input 
                          className="border border-outline-variant rounded p-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none" 
                          type="number"
                          min="1"
                          value={newCompanyPanels}
                          onChange={(e) => setNewCompanyPanels(e.target.value)}
                        />
                      </div>

                      {/* Preferred Days */}
                      <div className="flex flex-col gap-xs">
                        <label className="text-xs font-bold text-on-surface-variant uppercase">Preferred Days</label>
                        <select 
                          className="border border-outline-variant rounded p-sm bg-surface focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                          value={newCompanyDays}
                          onChange={(e) => setNewCompanyDays(e.target.value)}
                        >
                          <option value="All Days">All Days</option>
                          <option value="1">Day 1</option>
                          <option value="2">Day 2</option>
                          <option value="3">Day 3</option>
                          <option value="4">Day 4</option>
                        </select>
                      </div>

                      {/* Bottom Submit Action */}
                      <div className="mt-auto border-t border-outline-variant pt-md flex gap-sm shrink-0">
                        <button 
                          type="button"
                          onClick={() => setShowAddCompanyForm(false)} 
                          className="flex-1 py-sm px-md border border-outline-variant rounded hover:bg-surface-container-low font-bold uppercase transition-colors"
                        >
                          Cancel
                        </button>
                        <button 
                          type="submit" 
                          className="flex-1 py-sm px-md bg-primary-container text-on-primary rounded hover:opacity-90 font-bold uppercase transition-opacity"
                        >
                          Add Recruiter
                        </button>
                      </div>
                    </form>
                  </aside>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: STUDENTS MANAGEMENT */}
          {activeTab === 'students' && (
            <div className="flex-1 flex flex-col min-h-0 bg-background overflow-y-auto pr-sm gap-lg relative">
              
              {/* Header Section */}
              <div className="mb-md shrink-0">
                <h2 className="font-page-title text-page-title text-on-background">Students</h2>
                <p className="font-body-base text-body-base text-on-surface-variant mt-xs">Placement Week · Day {selectedTimelineDay}</p>
              </div>

              {/* KPIs */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-gutter mb-xl shrink-0">
                {/* KPI 1 */}
                <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-md shadow-sm relative group cursor-default">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-metadata text-metadata text-on-surface-variant uppercase tracking-wide">Total Students</p>
                      <p className="font-page-title text-page-title text-on-background mt-sm font-bold">{students.length}</p>
                    </div>
                    <div className="bg-surface-container-high p-xs rounded">
                      <span className="material-symbols-outlined text-primary">groups</span>
                    </div>
                  </div>
                </div>
                {/* KPI 2 */}
                <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-md shadow-sm relative group cursor-default">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-metadata text-metadata text-on-surface-variant uppercase tracking-wide">Active Interviews</p>
                      <p className="font-page-title text-page-title text-on-background mt-sm font-bold">
                        {interviews.filter(iv => iv.day === selectedTimelineDay && iv.status === 'SCHEDULED').length}
                      </p>
                    </div>
                    <div className="bg-surface-container-high p-xs rounded">
                      <span className="material-symbols-outlined text-secondary">forum</span>
                    </div>
                  </div>
                </div>
                {/* KPI 3 */}
                <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-md shadow-sm relative group cursor-default">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-metadata text-metadata text-on-surface-variant uppercase tracking-wide">Completed Today</p>
                      <p className="font-page-title text-page-title text-on-background mt-sm font-bold">
                        {interviews.filter(iv => iv.day === selectedTimelineDay && iv.status === 'SCHEDULED' && iv.id.charCodeAt(iv.id.length - 1) % 11 === 0).length}
                      </p>
                    </div>
                    <div className="bg-[#DCFCE7] text-[#15803D] p-xs rounded font-label-caps text-label-caps flex items-center gap-xs">
                      <span className="material-symbols-outlined text-[14px]">trending_up</span>
                      +12%
                    </div>
                  </div>
                </div>
                {/* KPI 4 */}
                <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-md shadow-sm relative group cursor-default">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-metadata text-metadata text-on-surface-variant uppercase tracking-wide">Waiting</p>
                      <p className="font-page-title text-page-title text-on-background mt-sm font-bold">
                        {students.filter(s => s.placement_status === 'UNPLACED' && !interviews.some(iv => iv.student_id === s.id && iv.day === selectedTimelineDay && iv.status === 'SCHEDULED')).length}
                      </p>
                    </div>
                    <div className="bg-[#FEF3C7] text-[#B45309] p-xs rounded font-label-caps text-label-caps">
                      Urgent
                    </div>
                  </div>
                </div>
              </div>

              {/* Table Controls */}
              <div className="flex flex-col md:flex-row justify-between items-center gap-md mb-md shrink-0">
                <div className="relative w-full md:w-80">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">search</span>
                  <input 
                    className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg py-sm pl-10 pr-4 text-body-compact focus:outline-none focus:ring-1 focus:ring-secondary focus:border-secondary transition-all text-on-surface" 
                    placeholder="Search students by name or ID..." 
                    type="text"
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setStudentsCurrentPage(1); }}
                  />
                </div>
                <div className="flex gap-sm w-full md:w-auto">
                  <button 
                    onClick={() => setShowStudentsFilters(!showStudentsFilters)}
                    className={`flex-1 md:flex-none flex items-center justify-center gap-xs px-md py-sm border rounded-lg text-body-compact font-label-caps transition-colors ${showStudentsFilters ? 'bg-primary-container text-on-primary-container border-primary-container' : 'bg-surface-container-lowest border-outline-variant text-on-surface hover:bg-surface-container-high'}`}
                  >
                    <span className="material-symbols-outlined text-[18px]">filter_list</span>
                    Filters
                  </button>
                  <button 
                    onClick={() => {
                      // Generate and export CSV of filtered students
                      const headers = ["Student Name", "Student ID", "Branch", "CGPA", "Placement Status", "Shortlisted Count"];
                      const rows = filteredStudents.map(s => [
                        s.name, 
                        s.id, 
                        s.branch, 
                        s.cgpa.toFixed(2), 
                        s.placement_status, 
                        companies.filter(c => s.cgpa >= c.cgpa_cutoff).length
                      ]);
                      const csvContent = "data:text/csv;charset=utf-8," 
                        + [headers.join(","), ...rows.map(e => e.map(val => `"${val}"`).join(","))].join("\n");
                      const encodedUri = encodeURI(csvContent);
                      const link = document.createElement("a");
                      link.setAttribute("href", encodedUri);
                      link.setAttribute("download", `Students_List_Day_${selectedTimelineDay}.csv`);
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    className="flex-1 md:flex-none flex items-center justify-center gap-xs px-md py-sm border border-outline-variant bg-surface-container-lowest rounded-lg hover:bg-surface-container-high transition-colors text-body-compact font-label-caps text-on-surface"
                  >
                    <span className="material-symbols-outlined text-[18px]">download</span>
                    Export CSV
                  </button>
                </div>
              </div>

              {/* Optional Filters Panel */}
              {showStudentsFilters && (
                <div className="p-md border border-outline-variant rounded-lg bg-surface-container-low flex flex-wrap gap-md mb-md shrink-0">
                  {/* CGPA Selector */}
                  <div className="flex flex-col gap-xs">
                    <span className="text-[11px] font-bold text-on-surface-variant uppercase">Minimum CGPA</span>
                    <select 
                      className="border border-outline-variant rounded text-[13px] bg-surface px-sm py-xs min-w-[150px]"
                      value={filterCGPA}
                      onChange={(e) => { setFilterCGPA(e.target.value); setStudentsCurrentPage(1); }}
                    >
                      <option value="all">All CGPA</option>
                      <option value="9.0">&gt;= 9.0 CGPA</option>
                      <option value="8.0">&gt;= 8.0 CGPA</option>
                      <option value="7.0">&gt;= 7.0 CGPA</option>
                    </select>
                  </div>
                  {/* Branch Selector */}
                  <div className="flex flex-col gap-xs">
                    <span className="text-[11px] font-bold text-on-surface-variant uppercase">Branch</span>
                    <select 
                      className="border border-outline-variant rounded text-[13px] bg-surface px-sm py-xs min-w-[150px]"
                      value={filterStudentBranch}
                      onChange={(e) => { setFilterStudentBranch(e.target.value); setStudentsCurrentPage(1); }}
                    >
                      <option value="all">All Branches</option>
                      <option value="CSE">CSE</option>
                      <option value="ECE">ECE</option>
                      <option value="EEE">EEE</option>
                      <option value="MECH">MECH</option>
                      <option value="CIVIL">CIVIL</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button 
                      onClick={() => { setFilterCGPA('all'); setFilterStudentBranch('all'); setStudentsCurrentPage(1); }}
                      className="px-sm py-xs bg-surface-container-lowest border border-outline-variant rounded text-xs hover:bg-surface-container-high transition-colors"
                    >
                      Reset Filters
                    </button>
                  </div>
                </div>
              )}

              {/* Data Table Container */}
              {(() => {
                const pageSize = 10;
                const totalItems = filteredStudents.length;
                const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
                const activePage = Math.min(studentsCurrentPage, totalPages);
                
                const startIndex = (activePage - 1) * pageSize;
                const paginatedStudents = filteredStudents.slice(startIndex, startIndex + pageSize);

                return (
                  <div className="bg-surface-container-lowest border border-outline-variant rounded-lg overflow-hidden flex flex-col shadow-sm flex-grow min-h-0">
                    <div className="overflow-auto flex-grow">
                      <table className="w-full text-left border-collapse min-w-[900px]">
                        <thead>
                          <tr className="bg-surface-container-low border-b border-outline-variant font-label-caps text-label-caps text-on-surface-variant uppercase sticky top-0 z-10">
                            <th className="py-sm px-md font-bold whitespace-nowrap">Student</th>
                            <th className="py-sm px-md font-bold whitespace-nowrap">ID</th>
                            <th className="py-sm px-md font-bold whitespace-nowrap">Branch</th>
                            <th className="py-sm px-md font-bold whitespace-nowrap">CGPA</th>
                            <th className="py-sm px-md font-bold whitespace-nowrap">Shortlisted</th>
                            <th className="py-sm px-md font-bold whitespace-nowrap">Today's Interviews</th>
                            <th className="py-sm px-md font-bold whitespace-nowrap">Status</th>
                            <th className="py-sm px-md"></th>
                          </tr>
                        </thead>
                        <tbody className="font-body-compact text-body-compact text-on-background divide-y divide-outline-variant/30">
                          {paginatedStudents.map((s, index) => {
                            const shortlistedCount = companies.filter(c => s.cgpa >= c.cgpa_cutoff).length;
                            const todayInterviews = interviews.filter(iv => iv.student_id === s.id && iv.day === selectedTimelineDay && iv.status === 'SCHEDULED');
                            
                            // Initialize initials for custom color icon representation
                            const initials = s.name.split(' ').map(n => n[0]).join('').toUpperCase();
                            const colors = ['bg-[#FECACA] text-[#991B1B]', 'bg-[#FED7AA] text-[#9A3412]', 'bg-[#FEF08A] text-[#854D0E]', 'bg-[#D9F99D] text-[#3F6212]', 'bg-[#BFDBFE] text-[#1E40AF]', 'bg-[#DDD6FE] text-[#5B21B6]', 'bg-[#FBCFE8] text-[#9D174D]'];
                            const colorClass = colors[index % colors.length];

                            // Status tags logic
                            let statusText = "Waiting";
                            let statusBadgeStyle = "bg-[#FEF3C7] text-[#B45309]";

                            if (s.placement_status === 'PLACED') {
                              statusText = "Completed";
                              statusBadgeStyle = "bg-[#DCFCE7] text-[#15803D]";
                            } else if (s.placement_status === 'WITHDRAWN') {
                              statusText = "Withdrawn";
                              statusBadgeStyle = "bg-surface-container-high text-on-surface-variant";
                            } else if (todayInterviews.length > 0) {
                              statusText = "Active";
                              statusBadgeStyle = "bg-[#DBEAFE] text-[#1E40AF]";
                            }

                            // Dynamic student avatars mapping
                            const imageIndex = (s.id.charCodeAt(s.id.length - 1) || 0) % 4;
                            const mockAvatars = [
                              "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&q=80&w=120&h=120",
                              "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=120&h=120",
                              "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=120&h=120",
                              "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&q=80&w=120&h=120"
                            ];

                            return (
                              <tr 
                                key={s.id} 
                                className="hover:bg-[#EFF6FF] transition-colors cursor-pointer group"
                                onClick={() => {
                                  if (todayInterviews.length > 0) {
                                    setSelectedInterview(todayInterviews[0]);
                                    setSelectedTimelineDay(selectedTimelineDay);
                                    setActiveTab('schedule');
                                  } else {
                                    setActiveTab('schedule');
                                  }
                                }}
                              >
                                <td className="py-sm px-md whitespace-nowrap">
                                  <div className="flex items-center gap-3">
                                    {imageIndex % 2 === 0 ? (
                                      <div className="h-8 w-8 rounded-full overflow-hidden border border-outline-variant shrink-0">
                                        <img alt="Student profile" className="w-full h-full object-cover" src={mockAvatars[imageIndex]} />
                                      </div>
                                    ) : (
                                      <div className={`h-8 w-8 rounded-full flex items-center justify-center border border-outline-variant font-label-caps font-bold shrink-0 ${colorClass}`}>
                                        {initials}
                                      </div>
                                    )}
                                    <span className="font-medium text-on-surface">{s.name}</span>
                                  </div>
                                </td>
                                <td className="py-sm px-md text-on-surface-variant whitespace-nowrap font-metadata text-metadata">{s.id}</td>
                                <td className="py-sm px-md whitespace-nowrap">{s.branch}</td>
                                <td className="py-sm px-md whitespace-nowrap font-medium">{s.cgpa.toFixed(2)}</td>
                                <td className="py-sm px-md whitespace-nowrap text-on-surface-variant">
                                  {shortlistedCount} {shortlistedCount === 1 ? 'Company' : 'Companies'}
                                </td>
                                <td className="py-sm px-md whitespace-nowrap">
                                  {todayInterviews.length > 0 ? (
                                    <div className="flex gap-1 items-center">
                                      <span className="w-2 h-2 rounded-full bg-secondary"></span>
                                      {todayInterviews.length} {todayInterviews.length === 1 ? 'Scheduled' : 'Scheduled'}
                                    </div>
                                  ) : (
                                    <span className="text-on-surface-variant">None Today</span>
                                  )}
                                </td>
                                <td className="py-sm px-md whitespace-nowrap">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${statusBadgeStyle}`}>
                                    {statusText}
                                  </span>
                                </td>
                                <td className="py-sm px-md text-right">
                                  <button className="text-on-surface-variant hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                                    <span className="material-symbols-outlined text-[20px]">more_vert</span>
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                          {filteredStudents.length === 0 && (
                            <tr>
                              <td colSpan={8} className="text-center py-lg text-on-surface-variant">No candidates match the current selection.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination Footer */}
                    <div className="bg-surface-container-lowest border-t border-outline-variant px-md py-sm flex items-center justify-between shrink-0">
                      <span className="font-metadata text-metadata text-on-surface-variant">
                        Showing {startIndex + 1} to {Math.min(startIndex + pageSize, totalItems)} of {totalItems} students
                      </span>
                      <div className="flex gap-xs">
                        <button 
                          className="p-1 rounded text-outline hover:bg-surface-container hover:text-on-surface disabled:opacity-50"
                          disabled={activePage === 1}
                          onClick={() => setStudentsCurrentPage(p => Math.max(1, p - 1))}
                        >
                          <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                        </button>
                        <button 
                          className="p-1 rounded text-outline hover:bg-surface-container hover:text-on-surface disabled:opacity-50"
                          disabled={activePage === totalPages}
                          onClick={() => setStudentsCurrentPage(p => Math.min(totalPages, p + 1))}
                        >
                          <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* TAB 6: ROOMS & PANELS */}
          {activeTab === 'rooms' && (
            <div className="flex-1 flex flex-col min-h-0 bg-background overflow-y-auto pr-sm gap-lg relative">
              
              {/* Header Section */}
              <div className="flex justify-between items-end mb-lg shrink-0">
                <div>
                  <h2 className="font-page-title text-page-title text-on-background font-bold">Rooms &amp; Panels</h2>
                  <p className="font-body-base text-body-base text-on-surface-variant mt-1">Resource allocation and status monitoring.</p>
                </div>
                <div className="flex gap-sm">
                  <button 
                    onClick={() => setShowAddRoomForm(true)}
                    className="px-4 py-2 bg-surface text-primary border border-outline-variant rounded font-label-caps text-label-caps hover:bg-surface-container-low transition-colors shadow-[0px_1px_3px_rgba(0,0,0,0.1)]"
                  >
                    Add Room
                  </button>
                  <button 
                    onClick={() => setActiveTab('replans')}
                    className="px-4 py-2 bg-primary-container text-on-primary rounded font-label-caps text-label-caps hover:opacity-90 transition-opacity shadow-[0px_1px_3px_rgba(0,0,0,0.1)] flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[16px]">add</span> Assign Panel
                  </button>
                </div>
              </div>

              {/* KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-md mb-xl shrink-0">
                {/* KPI 1 */}
                <div className="bg-surface rounded-lg p-md border border-outline-variant shadow-[0px_1px_3px_rgba(0,0,0,0.1)] relative">
                  <div className="font-page-title text-page-title text-on-surface font-bold">{rooms.length}</div>
                  <div className="font-metadata text-metadata text-on-surface-variant uppercase tracking-wider mt-1">Total Rooms</div>
                </div>
                {/* KPI 2 */}
                <div className="bg-surface rounded-lg p-md border border-outline-variant shadow-[0px_1px_3px_rgba(0,0,0,0.1)] relative">
                  {(() => {
                    const occupiedCount = rooms.filter(r => interviews.some(iv => iv.room_id === r.id && iv.day === selectedTimelineDay && iv.status === 'SCHEDULED')).length;
                    const occPercent = Math.round((occupiedCount / (rooms.length || 1)) * 100);
                    return (
                      <>
                        <div className="font-page-title text-page-title text-on-surface font-bold">{occupiedCount}</div>
                        <div className="font-metadata text-metadata text-on-surface-variant uppercase tracking-wider mt-1">Occupied Rooms</div>
                        <div className="absolute top-md right-md bg-secondary-fixed text-on-secondary-fixed-variant font-metadata text-[10px] px-2 py-0.5 rounded flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">trending_up</span> {occPercent}%
                        </div>
                      </>
                    );
                  })()}
                </div>
                {/* KPI 3 */}
                <div className="bg-surface rounded-lg p-md border border-outline-variant shadow-[0px_1px_3px_rgba(0,0,0,0.1)] relative">
                  <div className="font-page-title text-page-title text-on-surface font-bold">
                    {companies.reduce((sum, c) => sum + c.panel_count, 0)}
                  </div>
                  <div className="font-metadata text-metadata text-on-surface-variant uppercase tracking-wider mt-1">Available Panels</div>
                </div>
                {/* KPI 4 */}
                <div className="bg-surface rounded-lg p-md border border-outline-variant shadow-[0px_1px_3px_rgba(0,0,0,0.1)] relative">
                  <div className="font-page-title text-page-title text-error font-bold">
                    {rooms.filter(r => !r.is_available).length}
                  </div>
                  <div className="font-metadata text-metadata text-on-surface-variant uppercase tracking-wider mt-1">Under Maintenance</div>
                </div>
              </div>

              {/* Data Table */}
              <div className="bg-surface rounded-lg border border-outline-variant shadow-[0px_1px_3px_rgba(0,0,0,0.1)] overflow-hidden flex flex-col flex-grow min-h-0">
                <div className="px-md py-sm border-b border-outline-variant bg-surface-container-low flex justify-between items-center shrink-0">
                  <h3 className="font-section-heading text-section-heading text-on-surface font-bold">Room Logistics Directory</h3>
                </div>
                <div className="overflow-auto flex-grow">
                  <table className="w-full text-left border-collapse min-w-[900px]">
                    <thead>
                      <tr className="bg-surface-bright border-b border-outline-variant sticky top-0 z-10 font-label-caps text-label-caps text-on-surface-variant uppercase">
                        <th className="p-sm px-md font-semibold w-24">Room ID</th>
                        <th className="p-sm px-md font-semibold">Location</th>
                        <th className="p-sm px-md font-semibold w-20">Cap.</th>
                        <th className="p-sm px-md font-semibold">Tech Setup</th>
                        <th className="p-sm px-md font-semibold">Active Company</th>
                        <th className="p-sm px-md font-semibold w-32">Assigned Panel</th>
                        <th className="p-sm px-md font-semibold w-32">Status</th>
                        <th className="p-sm px-md text-right w-24">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="font-body-compact text-body-compact text-on-surface divide-y divide-outline-variant/50">
                      {rooms.map(r => {
                        const todaysInterviews = interviews.filter(iv => iv.room_id === r.id && iv.day === selectedTimelineDay && iv.status === 'SCHEDULED');
                        const activeComp = todaysInterviews.length > 0 ? (companies.find(c => c.id === todaysInterviews[0].company_id)?.name || todaysInterviews[0].company_id) : '-';
                        const assignedPanel = todaysInterviews.length > 0 ? `Panel 0${todaysInterviews[0].panel_index}` : '-';

                        // Mock tech setup
                        let techSetup = "Standard Setup";
                        const rIdNum = Number(r.id) || r.id.charCodeAt(0) || 1;
                        if (rIdNum % 3 === 0) techSetup = "Projector, VC System";
                        else if (rIdNum % 4 === 0) techSetup = "High-Speed LAN, Whiteboard";
                        else if (rIdNum % 5 === 0) techSetup = "Projector Screens";

                        // Status definitions
                        let statusText = "Available";
                        let badgeStyle = "bg-surface-variant text-on-surface-variant border-outline-variant";

                        if (!r.is_available) {
                          statusText = "Maintenance";
                          badgeStyle = "bg-error-container text-on-error-container";
                        } else if (todaysInterviews.length > 0) {
                          statusText = "Occupied";
                          badgeStyle = "bg-[#DBEAFE] text-[#1E40AF]";
                        } else {
                          statusText = "Available";
                          badgeStyle = "bg-[#DCFCE7] text-[#15803D]";
                        }

                        return (
                          <tr key={r.id} className="hover:bg-primary-fixed/20 transition-colors group cursor-pointer" onClick={() => { setActiveTab('schedule'); setSelectedTimelineDay(selectedTimelineDay); }}>
                            <td className="p-sm px-md font-semibold text-primary">{r.name || `RM-0${r.id}`}</td>
                            <td className="p-sm px-md text-on-surface-variant">{r.location}</td>
                            <td className="p-sm px-md font-bold">{r.capacity}</td>
                            <td className="p-sm px-md text-on-surface-variant text-metadata">{techSetup}</td>
                            <td className="p-sm px-md font-medium">{activeComp}</td>
                            <td className="p-sm px-md">{assignedPanel}</td>
                            <td className="p-sm px-md">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${badgeStyle}`}>
                                {statusText}
                              </span>
                            </td>
                            <td className="p-sm px-md text-right">
                              <button 
                                onClick={(e) => { e.stopPropagation(); setActiveTab('replans'); }}
                                className="text-secondary hover:text-secondary-container transition-colors opacity-0 group-hover:opacity-100"
                              >
                                <span className="material-symbols-outlined text-[18px]">edit</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Add Room slide-out drawer form */}
              {showAddRoomForm && (
                <div className="fixed inset-0 bg-black/30 z-50 flex justify-end transition-opacity duration-300">
                  <div className="flex-1" onClick={() => setShowAddRoomForm(false)}></div>
                  <aside className="w-[400px] bg-surface-container-lowest shadow-2xl flex flex-col h-full border-l border-outline-variant animate-slide-in p-md font-body-compact text-body-compact">
                    {/* Header */}
                    <div className="flex justify-between items-center border-b border-outline-variant pb-sm mb-md shrink-0">
                      <div>
                        <h3 className="font-section-heading text-[18px] text-primary font-bold">Add Physical Room</h3>
                        <p className="text-xs text-on-surface-variant">Configure physical resource capacity bounds.</p>
                      </div>
                      <button onClick={() => setShowAddRoomForm(false)} className="p-sm hover:bg-surface-container-high rounded text-on-surface-variant">
                        <span className="material-symbols-outlined text-[20px]">close</span>
                      </button>
                    </div>

                    {/* Form */}
                    <form 
                      onSubmit={(e) => {
                        e.preventDefault();
                        const nextId = String(rooms.length + 1);
                        const newR: Room = {
                          id: nextId,
                          name: newRoomIdInput || `RM-0${nextId}`,
                          location: newRoomLocation || `Main Block, Fl ${nextId}`,
                          capacity: Number(newRoomCapacity),
                          is_available: true
                        };
                        setRooms([...rooms, newR]);
                        setNewRoomIdInput('');
                        setNewRoomLocation('');
                        setShowAddRoomForm(false);
                      }}
                      className="flex-grow flex flex-col gap-md overflow-y-auto"
                    >
                      {/* Room Name */}
                      <div className="flex flex-col gap-xs">
                        <label className="text-xs font-bold text-on-surface-variant uppercase">Room Name *</label>
                        <input 
                          required
                          className="border border-outline-variant rounded p-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none" 
                          placeholder="e.g. RM-06" 
                          type="text"
                          value={newRoomIdInput}
                          onChange={(e) => setNewRoomIdInput(e.target.value)}
                        />
                      </div>
                      {/* Location */}
                      <div className="flex flex-col gap-xs">
                        <label className="text-xs font-bold text-on-surface-variant uppercase">Physical Location *</label>
                        <input 
                          required
                          className="border border-outline-variant rounded p-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none" 
                          placeholder="e.g. Main Block, 3rd Floor" 
                          type="text"
                          value={newRoomLocation}
                          onChange={(e) => setNewRoomLocation(e.target.value)}
                        />
                      </div>

                      {/* Capacity */}
                      <div className="flex flex-col gap-xs">
                        <label className="text-xs font-bold text-on-surface-variant uppercase">Capacity (Persons)</label>
                        <input 
                          className="border border-outline-variant rounded p-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none" 
                          type="number"
                          min="1"
                          max="20"
                          value={newRoomCapacity}
                          onChange={(e) => setNewRoomCapacity(e.target.value)}
                        />
                      </div>

                      {/* Setup type */}
                      <div className="flex flex-col gap-xs">
                        <label className="text-xs font-bold text-on-surface-variant uppercase">Tech Setup Features</label>
                        <select 
                          className="border border-outline-variant rounded p-sm bg-surface focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                          value={newRoomTech}
                          onChange={(e) => setNewRoomTech(e.target.value)}
                        >
                          <option value="Projector, VC System">Projector, VC System</option>
                          <option value="High-Speed LAN, Whiteboard">High-Speed LAN, Whiteboard</option>
                          <option value="Projector Screens">Projector Screens</option>
                          <option value="Standard Setup">Standard Setup</option>
                        </select>
                      </div>

                      {/* Actions */}
                      <div className="mt-auto border-t border-outline-variant pt-md flex gap-sm shrink-0">
                        <button 
                          type="button" 
                          onClick={() => setShowAddRoomForm(false)} 
                          className="flex-1 py-sm px-md border border-outline-variant rounded hover:bg-surface-container-low font-bold uppercase transition-colors"
                        >
                          Cancel
                        </button>
                        <button 
                          type="submit" 
                          className="flex-1 py-sm px-md bg-primary-container text-on-primary rounded hover:opacity-90 font-bold uppercase transition-opacity"
                        >
                          Add Room
                        </button>
                      </div>
                    </form>
                  </aside>
                </div>
              )}

            </div>
          )}

          {/* TAB 7: CONFLICTS LOG */}
          {activeTab === 'conflicts' && (
            <div className="flex-1 flex flex-col min-h-0 bg-surface gap-lg overflow-y-auto pr-sm relative">
              
              {/* Page Header */}
              <div className="flex flex-col gap-xs shrink-0">
                <h2 className="font-page-title text-page-title text-on-background font-bold">Conflicts Management</h2>
                <p className="font-body-base text-body-base text-on-surface-variant">Identify and resolve scheduling overlaps in real-time.</p>
              </div>

              {/* KPI Row */}
              {(() => {
                const unscheduledInterviews = interviews.filter(iv => iv.status === 'UNSCHEDULED');
                const totalConflicts = unscheduledInterviews.length;
                const studentOverlaps = unscheduledInterviews.filter(iv => iv.failure_reason?.toLowerCase().includes('student') || iv.blocking_constraint?.toLowerCase().includes('student')).length;
                const roomConflicts = unscheduledInterviews.filter(iv => iv.failure_reason?.toLowerCase().includes('room') || iv.blocking_constraint?.toLowerCase().includes('room')).length;
                const panelConflicts = unscheduledInterviews.filter(iv => iv.failure_reason?.toLowerCase().includes('panel') || iv.blocking_constraint?.toLowerCase().includes('panel')).length;

                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-md shrink-0">
                    <div className="bg-surface-container-lowest border border-outline-variant rounded p-md flex flex-col shadow-[0px_1px_3px_rgba(0,0,0,0.05)]">
                      <div className="flex justify-between items-start mb-sm">
                        <span className="font-metadata text-metadata text-on-surface-variant uppercase tracking-wider font-semibold">Total Conflicts</span>
                        <span className="bg-error-container text-on-error-container font-label-caps text-label-caps px-xs py-[2px] rounded uppercase flex items-center gap-[2px] font-bold">
                          <span className="material-symbols-outlined text-[12px]">warning</span> Critical
                        </span>
                      </div>
                      <span className="font-page-title text-page-title text-error font-bold leading-none">{totalConflicts}</span>
                    </div>
                    <div className="bg-surface-container-lowest border border-outline-variant rounded p-md flex flex-col shadow-[0px_1px_3px_rgba(0,0,0,0.05)]">
                      <div className="flex justify-between items-start mb-sm">
                        <span className="font-metadata text-metadata text-on-surface-variant uppercase tracking-wider font-semibold">Student Overlaps</span>
                        <span className="bg-surface-container-high text-on-surface-variant font-metadata text-metadata px-xs py-[2px] rounded font-semibold">Act Fast</span>
                      </div>
                      <span className="font-page-title text-page-title text-on-surface font-bold leading-none">{studentOverlaps}</span>
                    </div>
                    <div className="bg-surface-container-lowest border border-outline-variant rounded p-md flex flex-col shadow-[0px_1px_3px_rgba(0,0,0,0.05)]">
                      <div className="flex justify-between items-start mb-sm">
                        <span className="font-metadata text-metadata text-on-surface-variant uppercase tracking-wider font-semibold">Room Overlaps</span>
                      </div>
                      <span className="font-page-title text-page-title text-on-surface font-bold leading-none">{roomConflicts}</span>
                    </div>
                    <div className="bg-surface-container-lowest border border-outline-variant rounded p-md flex flex-col shadow-[0px_1px_3px_rgba(0,0,0,0.05)]">
                      <div className="flex justify-between items-start mb-sm">
                        <span className="font-metadata text-metadata text-on-surface-variant uppercase tracking-wider font-semibold">Panel Overlaps</span>
                      </div>
                      <span className="font-page-title text-page-title text-on-surface font-bold leading-none">{panelConflicts}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Main Data Section (Table + Drawer Layout) */}
              {(() => {
                const unscheduledInterviews = interviews.filter(iv => iv.status === 'UNSCHEDULED');
                const activeConflict = selectedConflict || (unscheduledInterviews.length > 0 ? unscheduledInterviews[0] : null);

                // Handle interactive resolution inline
                const handleResolveConflict = (conflictId: string) => {
                  setInterviews(prev => prev.map(iv => {
                    if (iv.id === conflictId) {
                      return {
                        ...iv,
                        status: 'SCHEDULED',
                        day: selectedTimelineDay || 2,
                        start_time: 540, // 9:00 AM
                        end_time: 600, // 10:00 AM
                        room_id: rooms[0]?.id || '1',
                        panel_index: 1
                      };
                    }
                    return iv;
                  }));
                  
                  // Add alert notification
                  if (activeConflict) {
                    const newNotif: NotificationItem = {
                      id: Date.now(),
                      recipient_type: 'STUDENT',
                      recipient_id: activeConflict.student_id,
                      message: `Conflict CF-${conflictId} resolved successfully. Candidate rescheduled.`,
                      created_at: new Date().toISOString()
                    };
                    setNotifications(prev => [newNotif, ...prev]);
                  }
                  setSelectedConflict(null);
                };

                return (
                  <div className="flex-1 flex gap-md min-h-[500px] relative">
                    {/* Data Table Container */}
                    <div className="flex-1 bg-surface-container-lowest border border-outline-variant rounded flex flex-col overflow-hidden shadow-[0px_1px_3px_rgba(0,0,0,0.05)]">
                      {/* Toolbar */}
                      <div className="p-sm border-b border-outline-variant flex justify-between items-center bg-surface-bright shrink-0">
                        <h3 className="font-section-heading text-section-heading text-on-surface px-sm font-bold">Active Conflicts</h3>
                        <div className="flex gap-sm">
                          <div className="relative">
                            <span className="material-symbols-outlined absolute left-sm top-1/2 -translate-y-1/2 text-[18px] text-outline">search</span>
                            <input 
                              className="pl-[32px] pr-sm py-xs border border-outline-variant rounded text-[13px] w-64 focus:ring-1 focus:ring-primary focus:border-primary outline-none" 
                              placeholder="Search student ID, company..." 
                              type="text"
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Table */}
                      <div className="flex-grow overflow-auto">
                        <table className="w-full text-left border-collapse">
                          <thead className="bg-surface-container-low sticky top-0 z-10 font-label-caps text-label-caps text-on-surface-variant uppercase">
                            <tr>
                              <th className="py-sm px-md font-semibold border-b border-outline-variant">ID</th>
                              <th className="py-sm px-md font-semibold border-b border-outline-variant">Severity</th>
                              <th className="py-sm px-md font-semibold border-b border-outline-variant">Type</th>
                              <th className="py-sm px-md font-semibold border-b border-outline-variant">Entities</th>
                              <th className="py-sm px-md font-semibold border-b border-outline-variant">Blocking Reason</th>
                              <th className="py-sm px-md font-semibold border-b border-outline-variant text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="font-body-compact text-body-compact divide-y divide-outline-variant/50">
                            {unscheduledInterviews
                              .filter(iv => {
                                if (searchQuery.trim() !== '') {
                                  const q = searchQuery.toLowerCase();
                                  return iv.student_id.toLowerCase().includes(q) || iv.company_id.toLowerCase().includes(q) || iv.id.toLowerCase().includes(q);
                                }
                                return true;
                              })
                              .map(iv => {
                                const stud = students.find(s => s.id === iv.student_id);
                                const comp = companies.find(c => c.id === iv.company_id);

                                let severity = "MEDIUM";
                                let severityClass = "bg-surface-container-high text-on-surface-variant";
                                if (stud && stud.cgpa >= 9.0) {
                                  severity = "CRITICAL";
                                  severityClass = "bg-error-container text-on-error-container";
                                } else if (stud && stud.cgpa >= 8.0) {
                                  severity = "HIGH";
                                  severityClass = "bg-[#FEF3C7] text-[#92400E]";
                                }

                                let conflictType = "Student Overlap";
                                if (iv.blocking_constraint?.includes("ROOM") || iv.failure_reason?.toLowerCase().includes("room")) {
                                  conflictType = "Room Booking Conflict";
                                } else if (iv.blocking_constraint?.includes("PANEL") || iv.failure_reason?.toLowerCase().includes("panel")) {
                                  conflictType = "Panel Conflict";
                                }

                                const isSelected = activeConflict?.id === iv.id;

                                return (
                                  <tr 
                                    key={iv.id} 
                                    className={`hover:bg-primary-fixed/20 cursor-pointer transition-colors group ${isSelected ? 'bg-primary-fixed/10' : ''}`}
                                    onClick={() => setSelectedConflict(iv)}
                                  >
                                    <td className="py-sm px-md font-medium text-primary">CF-{iv.id}</td>
                                    <td className="py-sm px-md">
                                      <span className={`inline-flex items-center px-1.5 py-[2px] rounded text-[10px] font-semibold tracking-wide border border-outline-variant/10 ${severityClass}`}>
                                        {severity}
                                      </span>
                                    </td>
                                    <td className="py-sm px-md text-on-surface">{conflictType}</td>
                                    <td className="py-sm px-md text-on-surface-variant font-medium">
                                      {stud?.name || iv.student_id} &amp; {comp?.name || iv.company_id}
                                    </td>
                                    <td className="py-sm px-md text-on-surface-variant font-medium">
                                      {iv.blocking_constraint || 'RESOURCE_EXHAUSTED'}
                                    </td>
                                    <td className="py-sm px-md text-right">
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); setSelectedConflict(iv); }}
                                        className="text-primary hover:text-secondary font-medium px-sm py-[2px] rounded border border-outline-variant/50 hover:bg-surface-container-highest transition-all"
                                      >
                                        Review
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            {unscheduledInterviews.length === 0 && (
                              <tr>
                                <td colSpan={6} className="text-center py-lg text-secondary font-bold">
                                  No unscheduled interviews! 100% completion rate achieved.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* Pagination */}
                      <div className="border-t border-outline-variant p-sm flex justify-between items-center bg-surface-bright text-[13px] text-on-surface-variant shrink-0">
                        <span>Showing 1-{unscheduledInterviews.length} of {unscheduledInterviews.length} conflicts</span>
                      </div>
                    </div>

                    {/* Right-Side Resolution Drawer */}
                    {activeConflict ? (
                      (() => {
                        const stud = students.find(s => s.id === activeConflict.student_id);
                        const comp = companies.find(c => c.id === activeConflict.company_id);

                        let severity = "MEDIUM";
                        let severityClass = "bg-surface-container-high text-on-surface-variant";
                        if (stud && stud.cgpa >= 9.0) {
                          severity = "CRITICAL";
                          severityClass = "bg-error-container text-on-error-container";
                        } else if (stud && stud.cgpa >= 8.0) {
                          severity = "HIGH";
                          severityClass = "bg-[#FEF3C7] text-[#92400E]";
                        }

                        let conflictType = "Student Overlap";
                        if (activeConflict.blocking_constraint?.includes("ROOM") || activeConflict.failure_reason?.toLowerCase().includes("room")) {
                          conflictType = "Room Booking Conflict";
                        } else if (activeConflict.blocking_constraint?.includes("PANEL") || activeConflict.failure_reason?.toLowerCase().includes("panel")) {
                          conflictType = "Panel Conflict";
                        }

                        return (
                          <div className="w-[400px] bg-surface-container-lowest border border-outline-variant rounded-lg shadow-[-4px_0_15px_rgba(0,0,0,0.05)] flex flex-col shrink-0 z-20">
                            {/* Drawer Header */}
                            <div className="p-md border-b border-outline-variant flex justify-between items-start bg-surface-bright shrink-0">
                              <div>
                                <div className="flex items-center gap-sm mb-xs">
                                  <h3 className="font-section-heading text-section-heading text-on-surface font-bold">CF-{activeConflict.id}</h3>
                                  <span className={`font-label-caps text-[10px] px-1.5 py-0.5 rounded uppercase font-bold ${severityClass}`}>
                                    {severity}
                                  </span>
                                </div>
                                <p className="font-metadata text-metadata text-on-surface-variant">{conflictType}</p>
                              </div>
                              <button onClick={() => setSelectedConflict(null)} className="text-on-surface-variant hover:text-on-surface p-[2px] rounded hover:bg-surface-container-low transition-colors">
                                <span className="material-symbols-outlined text-[20px]">close</span>
                              </button>
                            </div>

                            {/* Drawer Content */}
                            <div className="flex-grow overflow-y-auto p-md flex flex-col gap-lg font-body-compact text-body-compact">
                              {/* Details Section */}
                              <div>
                                <h4 className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-sm border-b border-outline-variant/50 pb-xs font-bold">Conflict Details</h4>
                                <div className="bg-error-container/20 border border-error-container/50 rounded p-sm flex gap-sm items-start text-on-surface">
                                  <span className="material-symbols-outlined text-error text-[18px] mt-[2px]">info</span>
                                  <div>
                                    <p className="mb-xs">Student <strong>{stud?.name || activeConflict.student_id}</strong> is unplaced/unscheduled:</p>
                                    <ul className="list-disc list-inside text-on-surface-variant ml-xs space-y-1">
                                      <li>Company: {comp?.name || activeConflict.company_id}</li>
                                      <li>Reason: {activeConflict.failure_reason || 'Unscheduled constraint block'}</li>
                                      <li>Constraint: {activeConflict.blocking_constraint || 'None'}</li>
                                    </ul>
                                    <p className="mt-sm font-medium text-error text-[12px]">CGPA Cutoff Required: {comp?.cgpa_cutoff.toFixed(2)}</p>
                                  </div>
                                </div>
                              </div>

                              {/* Suggested Fixes Section */}
                              <div>
                                <h4 className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-sm border-b border-outline-variant/50 pb-xs font-bold">Suggested Resolutions</h4>
                                <div className="space-y-sm">
                                  {/* Option 1 */}
                                  <label 
                                    onClick={() => setSelectedResolutionOption('option1')}
                                    className={`flex items-start gap-sm p-sm border rounded cursor-pointer hover:bg-primary-fixed/5 transition-colors ${selectedResolutionOption === 'option1' ? 'border-primary/50 bg-primary-fixed/10' : 'border-outline-variant'}`}
                                  >
                                    <input 
                                      type="radio" 
                                      name="resolution" 
                                      checked={selectedResolutionOption === 'option1'}
                                      onChange={() => {}}
                                      className="mt-[2px] text-primary focus:ring-primary border-outline-variant"
                                    />
                                    <div>
                                      <p className="font-bold text-on-surface mb-[2px]">Incremental Replan Override</p>
                                      <p className="text-on-surface-variant text-[12px]">Force-schedule to next available slot on Day {activeConflict.day || selectedTimelineDay}.</p>
                                      <span className="inline-block mt-xs bg-surface-container-high text-on-surface-variant text-[10px] px-xs rounded font-medium">Impact: Low</span>
                                    </div>
                                  </label>
                                  {/* Option 2 */}
                                  <label 
                                    onClick={() => setSelectedResolutionOption('option2')}
                                    className={`flex items-start gap-sm p-sm border rounded cursor-pointer hover:bg-primary-fixed/5 transition-colors ${selectedResolutionOption === 'option2' ? 'border-primary/50 bg-primary-fixed/10' : 'border-outline-variant'}`}
                                  >
                                    <input 
                                      type="radio" 
                                      name="resolution" 
                                      checked={selectedResolutionOption === 'option2'}
                                      onChange={() => {}}
                                      className="mt-[2px] text-primary focus:ring-primary border-outline-variant"
                                    />
                                    <div>
                                      <p className="font-bold text-on-surface mb-[2px]">Allocate Backup Panel Room</p>
                                      <p className="text-on-surface-variant text-[12px]">Provision extra rooms to bypass the allocation bottleneck.</p>
                                      <span className="inline-block mt-xs bg-surface-container-high text-on-surface-variant text-[10px] px-xs rounded font-medium">Impact: Medium</span>
                                    </div>
                                  </label>
                                </div>
                              </div>
                            </div>

                            {/* Drawer Footer */}
                            <div className="p-md border-t border-outline-variant bg-surface-bright flex gap-sm shrink-0">
                              <button 
                                onClick={() => setSelectedConflict(null)}
                                className="flex-1 px-md py-sm bg-surface-container border border-outline-variant rounded font-medium text-[13px] text-on-surface hover:bg-surface-container-high transition-colors text-center"
                              >
                                Dismiss
                              </button>
                              <button 
                                onClick={() => handleResolveConflict(activeConflict.id)}
                                className="flex-[2] px-md py-sm bg-[#1E3A5F] rounded font-medium text-[13px] text-white hover:opacity-90 transition-opacity text-center shadow-[0_1px_2px_rgba(0,0,0,0.1)]"
                              >
                                Resolve Conflict
                              </button>
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <div className="w-[400px] border border-outline-variant rounded-lg bg-surface-container-low flex flex-col justify-center items-center p-lg text-center text-on-surface-variant shrink-0">
                        <span className="material-symbols-outlined text-[48px] text-outline mb-md">warning</span>
                        <h4 className="font-bold mb-xs">No Conflict Selected</h4>
                        <p className="text-xs">Select any conflict on the directory log to view diagnostics and resolution recommendations.</p>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* TAB 8: REPLANS & DISRUPTIONS */}
          {activeTab === 'replans' && (
            <div className="flex-1 flex flex-col min-h-0 bg-background overflow-y-auto pr-sm gap-lg relative pb-xl">
              
              {/* Header Section */}
              <div className="flex flex-col gap-xs shrink-0">
                <h2 className="font-page-title text-page-title text-primary font-bold">Replan Schedule</h2>
                <p className="font-body-base text-body-base text-on-surface-variant">Define the disruption affecting today's operations.</p>
              </div>

              {/* Select Disruption Type Grid */}
              <section className="flex flex-col gap-md shrink-0">
                <h3 className="font-section-heading text-section-heading text-on-surface font-bold">Select Disruption Type</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-md">
                  {/* Card 1: Company Delay */}
                  <div 
                    onClick={() => setActiveDisruptionType('company-delay')}
                    className={`bg-surface border rounded-lg p-md cursor-pointer hover:shadow-[0_1px_3px_rgba(0,0,0,0.1)] transition-all flex flex-col items-center text-center gap-sm relative ${activeDisruptionType === 'company-delay' ? 'border-2 border-secondary' : 'border-outline-variant opacity-70 hover:opacity-100'}`}
                  >
                    {activeDisruptionType === 'company-delay' && (
                      <div className="absolute top-sm right-sm text-secondary">
                        <span className="material-symbols-outlined text-[18px]">check_circle</span>
                      </div>
                    )}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-xs ${activeDisruptionType === 'company-delay' ? 'bg-secondary/10 text-secondary' : 'bg-surface-container-high text-on-surface-variant'}`}>
                      <span className="material-symbols-outlined">business</span>
                    </div>
                    <span className="font-body-compact text-body-compact font-semibold text-on-surface">Company Delay</span>
                    <span className="font-metadata text-metadata text-on-surface-variant">e.g., Arriving late</span>
                  </div>

                  {/* Card 2: Panel Dropout */}
                  <div 
                    onClick={() => setActiveDisruptionType('panel-dropout')}
                    className={`bg-surface border rounded-lg p-md cursor-pointer hover:shadow-[0_1px_3px_rgba(0,0,0,0.1)] transition-all flex flex-col items-center text-center gap-sm relative ${activeDisruptionType === 'panel-dropout' ? 'border-2 border-secondary' : 'border-outline-variant opacity-70 hover:opacity-100'}`}
                  >
                    {activeDisruptionType === 'panel-dropout' && (
                      <div className="absolute top-sm right-sm text-secondary">
                        <span className="material-symbols-outlined text-[18px]">check_circle</span>
                      </div>
                    )}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-xs ${activeDisruptionType === 'panel-dropout' ? 'bg-secondary/10 text-secondary' : 'bg-surface-container-high text-on-surface-variant'}`}>
                      <span className="material-symbols-outlined">person_off</span>
                    </div>
                    <span className="font-body-compact text-body-compact font-semibold text-on-surface">Panel Unavailable</span>
                    <span className="font-metadata text-metadata text-on-surface-variant">e.g., Sick leave</span>
                  </div>

                  {/* Card 3: Student Withdrawal */}
                  <div 
                    onClick={() => setActiveDisruptionType('student-withdrawal')}
                    className={`bg-surface border rounded-lg p-md cursor-pointer hover:shadow-[0_1px_3px_rgba(0,0,0,0.1)] transition-all flex flex-col items-center text-center gap-sm relative ${activeDisruptionType === 'student-withdrawal' ? 'border-2 border-secondary' : 'border-outline-variant opacity-70 hover:opacity-100'}`}
                  >
                    {activeDisruptionType === 'student-withdrawal' && (
                      <div className="absolute top-sm right-sm text-secondary">
                        <span className="material-symbols-outlined text-[18px]">check_circle</span>
                      </div>
                    )}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-xs ${activeDisruptionType === 'student-withdrawal' ? 'bg-secondary/10 text-secondary' : 'bg-surface-container-high text-on-surface-variant'}`}>
                      <span className="material-symbols-outlined">school</span>
                    </div>
                    <span className="font-body-compact text-body-compact font-semibold text-on-surface">Student Withdrawal</span>
                    <span className="font-metadata text-metadata text-on-surface-variant">e.g., Opt-out</span>
                  </div>

                  {/* Card 4: Room Outage */}
                  <div 
                    onClick={() => setActiveDisruptionType('room-unavailable')}
                    className={`bg-surface border rounded-lg p-md cursor-pointer hover:shadow-[0_1px_3px_rgba(0,0,0,0.1)] transition-all flex flex-col items-center text-center gap-sm relative ${activeDisruptionType === 'room-unavailable' ? 'border-2 border-secondary' : 'border-outline-variant opacity-70 hover:opacity-100'}`}
                  >
                    {activeDisruptionType === 'room-unavailable' && (
                      <div className="absolute top-sm right-sm text-secondary">
                        <span className="material-symbols-outlined text-[18px]">check_circle</span>
                      </div>
                    )}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-xs ${activeDisruptionType === 'room-unavailable' ? 'bg-secondary/10 text-secondary' : 'bg-surface-container-high text-on-surface-variant'}`}>
                      <span className="material-symbols-outlined">meeting_room</span>
                    </div>
                    <span className="font-body-compact text-body-compact font-semibold text-on-surface">Room Unavailable</span>
                    <span className="font-metadata text-metadata text-on-surface-variant">e.g., Maintenance</span>
                  </div>
                </div>
              </section>

              {/* Form Config & Impact Previews */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-lg mt-md shrink-0">
                {/* Dynamic Configuration Form */}
                <section className="md:col-span-2 bg-surface border border-outline-variant rounded-lg p-lg flex flex-col gap-md">
                  <h3 className="font-section-heading text-section-heading text-on-surface border-b border-outline-variant pb-sm font-bold">
                    Configuration: {activeDisruptionType === 'company-delay' ? 'Company Delay' : activeDisruptionType === 'panel-dropout' ? 'Panel Dropout' : activeDisruptionType === 'student-withdrawal' ? 'Student Withdrawal' : 'Room Outage'}
                  </h3>

                  {activeDisruptionType === 'company-delay' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-md mt-sm">
                      <div className="flex flex-col gap-xs">
                        <label className="font-label-caps text-label-caps text-on-surface-variant font-bold">Company Selection</label>
                        <select 
                          className="w-full border border-outline-variant rounded bg-surface px-sm py-sm font-body-compact text-body-compact text-on-surface focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
                          value={delayCompany}
                          onChange={(e) => setDelayCompany(e.target.value)}
                        >
                          <option value="">Select Recruiter</option>
                          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div className="flex flex-col gap-xs">
                        <label className="font-label-caps text-label-caps text-on-surface-variant font-bold">Placement Day</label>
                        <select 
                          className="w-full border border-outline-variant rounded bg-surface px-sm py-sm font-body-compact text-body-compact text-on-surface focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
                          value={delayDay}
                          onChange={(e) => setDelayDay(e.target.value)}
                        >
                          <option value="1">Day 1</option>
                          <option value="2">Day 2</option>
                          <option value="3">Day 3</option>
                          <option value="4">Day 4</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-xs">
                        <label className="font-label-caps text-label-caps text-on-surface-variant font-bold">Delay Duration</label>
                        <select 
                          className="w-full border border-outline-variant rounded bg-surface px-sm py-sm font-body-compact text-body-compact text-on-surface focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
                          value={delayMinutes}
                          onChange={(e) => setDelayMinutes(e.target.value)}
                        >
                          <option value="30">30 minutes</option>
                          <option value="60">1 hour</option>
                          <option value="120">2 hours</option>
                          <option value="180">3 hours</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {activeDisruptionType === 'panel-dropout' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-md mt-sm">
                      <div className="flex flex-col gap-xs">
                        <label className="font-label-caps text-label-caps text-on-surface-variant font-bold">Select Recruiter</label>
                        <select 
                          className="w-full border border-outline-variant rounded bg-surface px-sm py-sm font-body-compact text-body-compact text-on-surface focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
                          value={dropoutCompany}
                          onChange={(e) => setDropoutCompany(e.target.value)}
                        >
                          <option value="">Select Company</option>
                          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div className="flex flex-col gap-xs">
                        <label className="font-label-caps text-label-caps text-on-surface-variant font-bold">Panel index</label>
                        <input 
                          className="w-full border border-outline-variant rounded bg-surface px-sm py-sm font-body-compact text-body-compact text-on-surface focus:outline-none"
                          type="number"
                          min="1"
                          value={dropoutPanel}
                          onChange={(e) => setDropoutPanel(e.target.value)}
                        />
                      </div>
                      <div className="flex flex-col gap-xs">
                        <label className="font-label-caps text-label-caps text-on-surface-variant font-bold">Day</label>
                        <select 
                          className="w-full border border-outline-variant rounded bg-surface px-sm py-sm font-body-compact text-body-compact text-on-surface"
                          value={dropoutDay}
                          onChange={(e) => setDropoutDay(e.target.value)}
                        >
                          <option value="1">Day 1</option>
                          <option value="2">Day 2</option>
                          <option value="3">Day 3</option>
                          <option value="4">Day 4</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-xs">
                        <div className="flex flex-col gap-xs">
                          <label className="font-label-caps text-label-caps text-on-surface-variant font-bold">Start (mins)</label>
                          <input type="number" className="border border-outline-variant rounded p-sm text-xs w-full" value={dropoutStart} onChange={e => setDropoutStart(e.target.value)} />
                        </div>
                        <div className="flex flex-col gap-xs">
                          <label className="font-label-caps text-label-caps text-on-surface-variant font-bold">End (mins)</label>
                          <input type="number" className="border border-outline-variant rounded p-sm text-xs w-full" value={dropoutEnd} onChange={e => setDropoutEnd(e.target.value)} />
                        </div>
                      </div>
                    </div>
                  )}

                  {activeDisruptionType === 'student-withdrawal' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-md mt-sm">
                      <div className="flex flex-col gap-xs">
                        <label className="font-label-caps text-label-caps text-on-surface-variant font-bold">Student Selector</label>
                        <select 
                          className="w-full border border-outline-variant rounded bg-surface px-sm py-sm font-body-compact text-body-compact text-on-surface focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
                          value={withdrawStudent}
                          onChange={(e) => setWithdrawStudent(e.target.value)}
                        >
                          <option value="">Select Candidate</option>
                          {students.map(s => <option key={s.id} value={s.id}>{s.name} ({s.id})</option>)}
                        </select>
                      </div>
                    </div>
                  )}

                  {activeDisruptionType === 'room-unavailable' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-md mt-sm">
                      <div className="flex flex-col gap-xs">
                        <label className="font-label-caps text-label-caps text-on-surface-variant font-bold">Room Outage</label>
                        <select 
                          className="w-full border border-outline-variant rounded bg-surface px-sm py-sm font-body-compact text-body-compact text-on-surface focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
                          value={outageRoom}
                          onChange={(e) => setOutageRoom(e.target.value)}
                        >
                          <option value="">Select Room</option>
                          {rooms.map(r => <option key={r.id} value={r.id}>{r.name || `Room ${r.id}`}</option>)}
                        </select>
                      </div>
                      <div className="flex flex-col gap-xs">
                        <label className="font-label-caps text-label-caps text-on-surface-variant font-bold">Day</label>
                        <select 
                          className="w-full border border-outline-variant rounded bg-surface px-sm py-sm font-body-compact text-body-compact text-on-surface"
                          value={outageDay}
                          onChange={(e) => setOutageDay(e.target.value)}
                        >
                          <option value="1">Day 1</option>
                          <option value="2">Day 2</option>
                          <option value="3">Day 3</option>
                          <option value="4">Day 4</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-xs">
                        <div className="flex flex-col gap-xs">
                          <label className="font-label-caps text-label-caps text-on-surface-variant font-bold">Start (mins)</label>
                          <input type="number" className="border border-outline-variant rounded p-sm text-xs w-full" value={outageStart} onChange={e => setOutageStart(e.target.value)} />
                        </div>
                        <div className="flex flex-col gap-xs">
                          <label className="font-label-caps text-label-caps text-on-surface-variant font-bold">End (mins)</label>
                          <input type="number" className="border border-outline-variant rounded p-sm text-xs w-full" value={outageEnd} onChange={e => setOutageEnd(e.target.value)} />
                        </div>
                      </div>
                    </div>
                  )}
                </section>

                {/* Estimated Impact Card */}
                <aside className="md:col-span-1 bg-surface-container-low border border-outline-variant rounded-lg p-md flex flex-col gap-md">
                  <h3 className="font-section-heading text-section-heading text-on-surface flex items-center gap-sm font-bold">
                    <span className="material-symbols-outlined text-error">warning</span> Estimated Impact
                  </h3>
                  <p className="font-metadata text-metadata text-on-surface-variant">Before replan optimization.</p>
                  
                  {(() => {
                    let affectedCount = 0;
                    let studentsCount = 0;
                    let roomsReq = 0;
                    let panelsAdj = 0;

                    if (activeDisruptionType === 'company-delay' && delayCompany) {
                      affectedCount = interviews.filter(iv => iv.company_id === delayCompany && iv.day === Number(delayDay) && iv.status === 'SCHEDULED').length;
                      studentsCount = new Set(interviews.filter(iv => iv.company_id === delayCompany && iv.day === Number(delayDay) && iv.status === 'SCHEDULED').map(iv => iv.student_id)).size;
                      roomsReq = 1;
                      panelsAdj = 2;
                    } else if (activeDisruptionType === 'panel-dropout' && dropoutCompany) {
                      affectedCount = interviews.filter(iv => iv.company_id === dropoutCompany && iv.day === Number(dropoutDay) && iv.panel_index === Number(dropoutPanel) && iv.status === 'SCHEDULED').length;
                      studentsCount = affectedCount;
                      roomsReq = 0;
                      panelsAdj = 1;
                    } else if (activeDisruptionType === 'student-withdrawal' && withdrawStudent) {
                      affectedCount = interviews.filter(iv => iv.student_id === withdrawStudent && iv.status === 'SCHEDULED').length;
                      studentsCount = affectedCount > 0 ? 1 : 0;
                    } else if (activeDisruptionType === 'room-unavailable' && outageRoom) {
                      affectedCount = interviews.filter(iv => iv.room_id === outageRoom && iv.day === Number(outageDay) && iv.status === 'SCHEDULED').length;
                      studentsCount = new Set(interviews.filter(iv => iv.room_id === outageRoom && iv.day === Number(outageDay) && iv.status === 'SCHEDULED').map(iv => iv.student_id)).size;
                      roomsReq = 1;
                    }

                    return (
                      <ul className="flex flex-col gap-sm mt-xs">
                        <li className="flex justify-between items-center bg-surface p-sm rounded border border-outline-variant/50">
                          <span className="font-body-compact text-body-compact text-on-surface-variant">Interviews Affected</span>
                          <span className="font-body-compact text-body-compact font-semibold text-error">{affectedCount}</span>
                        </li>
                        <li className="flex justify-between items-center bg-surface p-sm rounded border border-outline-variant/50">
                          <span className="font-body-compact text-body-compact text-on-surface-variant">Students Affected</span>
                          <span className="font-body-compact text-body-compact font-semibold text-error">{studentsCount}</span>
                        </li>
                        <li className="flex justify-between items-center bg-surface p-sm rounded border border-outline-variant/50">
                          <span className="font-body-compact text-body-compact text-on-surface-variant">Rooms Required</span>
                          <span className="font-body-compact text-body-compact font-semibold text-secondary">{roomsReq}</span>
                        </li>
                        <li className="flex justify-between items-center bg-surface p-sm rounded border border-outline-variant/50">
                          <span className="font-body-compact text-body-compact text-on-surface-variant">Panels Adjusted</span>
                          <span className="font-body-compact text-body-compact font-semibold text-secondary">{panelsAdj}</span>
                        </li>
                      </ul>
                    );
                  })()}
                </aside>
              </div>

              {/* Action Toolbar */}
              <div className="flex justify-end gap-md pt-lg border-t border-outline-variant mt-md shrink-0">
                <button 
                  onClick={() => {
                    setDelayCompany('');
                    setDropoutCompany('');
                    setWithdrawStudent('');
                    setOutageRoom('');
                    setActiveTab('overview');
                  }}
                  className="px-lg py-sm rounded border border-outline-variant text-on-surface hover:bg-surface-container-high transition-colors font-body-base text-body-base font-semibold"
                >
                  Cancel
                </button>
                <button 
                  disabled={loading}
                  onClick={() => {
                    if (activeDisruptionType === 'company-delay') {
                      if (!delayCompany) return;
                      handleDisruption('company-delay', {
                        company_id: delayCompany,
                        day: Number(delayDay),
                        delay_minutes: Number(delayMinutes)
                      });
                    } else if (activeDisruptionType === 'panel-dropout') {
                      if (!dropoutCompany) return;
                      handleDisruption('panel-dropout', {
                        company_id: dropoutCompany,
                        panel_index: Number(dropoutPanel),
                        day: Number(dropoutDay),
                        start_time: Number(dropoutStart),
                        end_time: Number(dropoutEnd)
                      });
                    } else if (activeDisruptionType === 'student-withdrawal') {
                      if (!withdrawStudent) return;
                      handleDisruption('student-withdrawal', {
                        student_id: withdrawStudent
                      });
                    } else if (activeDisruptionType === 'room-unavailable') {
                      if (!outageRoom) return;
                      handleDisruption('room-unavailable', {
                        room_id: outageRoom,
                        day: Number(outageDay),
                        start_time: Number(outageStart),
                        end_time: Number(outageEnd)
                      });
                    }
                  }}
                  className="px-lg py-sm rounded bg-primary-container text-on-primary font-body-base text-body-base font-semibold hover:opacity-90 transition-opacity shadow-[0_1px_3px_rgba(0,0,0,0.1)] flex items-center gap-sm"
                >
                  <span className="material-symbols-outlined text-[20px]">auto_awesome</span> Replan Schedule
                </button>
              </div>

              {/* Show Replan Change logs Diff */}
              {lastReplanSummary && (
                <div className="bg-[#EFF6FF] border border-[#adc8f5] rounded p-md flex flex-col gap-md shrink-0 shadow-[0_1px_2px_rgba(0,0,0,0.05)] mt-md">
                  <h3 className="font-body-compact font-bold text-[#1E3A5F] flex items-center gap-xs">
                    <span className="material-symbols-outlined text-[20px] text-[#1E3A5F]">check_circle</span>
                    REPLAN COMPLETE (Disruption Level: {lastReplanSummary.estimated_disruption})
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-md">
                    <div className="p-sm bg-surface-container-lowest rounded border border-[#adc8f5]/50">
                      <span className="text-[11px] text-on-surface-variant font-bold uppercase tracking-wider">Appointments Moved</span>
                      <p className="font-page-title text-[20px] font-bold text-[#92400E] mt-xs">{lastReplanSummary.appointments_moved}</p>
                    </div>
                    <div className="p-sm bg-surface-container-lowest rounded border border-[#adc8f5]/50">
                      <span className="text-[11px] text-on-surface-variant font-bold uppercase tracking-wider">Appointments Cancelled</span>
                      <p className="font-page-title text-[20px] font-bold text-error mt-xs">{lastReplanSummary.appointments_cancelled}</p>
                    </div>
                    <div className="p-sm bg-surface-container-lowest rounded border border-[#adc8f5]/50">
                      <span className="text-[11px] text-on-surface-variant font-bold uppercase tracking-wider">Affected Recipient Alerts</span>
                      <p className="font-page-title text-[20px] font-bold text-primary mt-xs">{lastReplanSummary.students_notified}</p>
                    </div>
                    <div className="p-sm bg-surface-container-lowest rounded border border-[#adc8f5]/50">
                      <span className="text-[11px] text-on-surface-variant font-bold uppercase tracking-wider">Affected resources</span>
                      <p className="font-page-title text-[20px] font-bold text-primary mt-xs">{lastReplanSummary.rooms_affected} rooms • {lastReplanSummary.panels_affected} panels</p>
                    </div>
                  </div>

                  {/* Changes Diff Table */}
                  <div>
                    <h4 className="font-body-compact font-bold text-[#1E3A5F] mb-xs">Change Logs Diff:</h4>
                    <div className="border border-[#adc8f5] bg-surface-container-lowest rounded max-h-[250px] overflow-y-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-[#F9FAFB] border-b border-[#adc8f5] sticky top-0">
                          <tr>
                            <th className="px-sm py-xs font-bold text-on-surface-variant">Student</th>
                            <th className="px-sm py-xs font-bold text-on-surface-variant">Company</th>
                            <th className="px-sm py-xs font-bold text-on-surface-variant text-center">Change Type</th>
                            <th className="px-sm py-xs font-bold text-on-surface-variant">Old Slot</th>
                            <th className="px-sm py-xs font-bold text-on-surface-variant">New Slot</th>
                            <th className="px-sm py-xs font-bold text-on-surface-variant">Reason / Blocker</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F3F4F6]">
                          {lastReplanSummary.changes.map((c, i) => (
                            <tr key={i} className="hover:bg-[#EFF6FF] transition-colors">
                              <td className="px-sm py-xs font-semibold">{c.student_name} ({c.student_id})</td>
                              <td className="px-sm py-xs font-medium">{c.company_name}</td>
                              <td className="px-sm py-xs text-center">
                                <span className={`inline-block px-1.5 py-[2px] rounded text-[10px] font-bold ${c.change_type === 'MOVED' ? 'bg-[#FEF3C7] text-[#92400E]' : c.change_type === 'CANCELLED' ? 'bg-red-50 text-error' : 'bg-green-50 text-secondary'}`}>
                                  {c.change_type}
                                </span>
                              </td>
                              <td className="px-sm py-xs text-on-surface-variant font-variant-numeric">{c.old_start_time ? `Day ${selectedTimelineDay} @ ${formatTime(c.old_start_time)}` : '-'}</td>
                              <td className="px-sm py-xs text-on-surface font-semibold font-variant-numeric">{c.new_start_time ? `Day ${selectedTimelineDay} @ ${formatTime(c.new_start_time)}` : '-'}</td>
                              <td className="px-sm py-xs text-on-surface-variant truncate max-w-[200px]">{c.impact || c.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Version History logs */}
              <div className="bg-surface-container-lowest border border-outline-variant rounded flex flex-col min-h-[300px] shadow-[0px_1px_3px_rgba(0,0,0,0.05)] pb-md mt-md">
                <div className="p-md border-b border-outline-variant bg-surface-bright shrink-0">
                  <h3 className="font-section-heading text-section-heading text-on-surface font-bold">Historical Audits Logs</h3>
                </div>
                <div className="overflow-y-auto flex-grow px-md pt-md flex flex-col gap-sm">
                  {replanLogs.map(log => (
                    <div 
                      key={log.id} 
                      onClick={() => setSelectedVersion(log.new_version_id)}
                      className={`p-sm border rounded flex justify-between items-center cursor-pointer transition-all hover:bg-surface-container-low/50 ${selectedVersion === log.new_version_id ? 'border-primary ring-1 ring-primary bg-primary-fixed/10' : 'border-outline-variant bg-surface-container-lowest'}`}
                    >
                      <div>
                        <div className="flex items-center gap-sm">
                          <span className="font-body-compact font-bold text-on-surface">Replan Incident #{log.id}</span>
                          <span className="bg-surface-container-high text-on-surface-variant font-label-caps text-[9px] px-1.5 py-[1px] rounded uppercase font-bold">{log.disruption_type}</span>
                        </div>
                        <p className="text-[11px] text-on-surface-variant mt-xs">
                          Parameters details: {JSON.stringify(log.parameters)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-on-surface-variant">{new Date(log.timestamp).toLocaleString()}</p>
                        <p className="text-[12px] font-bold text-secondary mt-xs">
                          {log.moved_count} moved, {log.cancelled_count} cancelled
                        </p>
                      </div>
                    </div>
                  ))}
                  {replanLogs.length === 0 && (
                    <p className="text-center py-lg text-on-surface-variant text-sm">No disruptions have been simulated yet. Use the delay/dropout tools above to test.</p>
                  )}
                </div>
              </div>

            </div>
          )}

        </main>
      </div>
    </div>
  );
}
