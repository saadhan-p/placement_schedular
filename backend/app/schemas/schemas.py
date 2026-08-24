from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

# Company Availability Schemas
class CompanyAvailabilityBase(BaseModel):
    day: int
    start_time: int
    end_time: int

    class Config:
        from_attributes = True

# Company Schemas
class CompanyBase(BaseModel):
    id: str
    name: str
    priority_tier: int
    cgpa_cutoff: float
    interview_duration: int
    panel_count: int
    expected_shortlist_count: int
    preferred_days: Optional[str] = None

class CompanyCreate(CompanyBase):
    pass

class CompanyResponse(CompanyBase):
    availabilities: List[CompanyAvailabilityBase] = []

    class Config:
        from_attributes = True

# Student Schemas
class StudentBase(BaseModel):
    id: str
    name: str
    branch: str
    cgpa: float
    graduation_year: int
    shortlisted_companies: Optional[str] = None
    placement_status: str
    withdrawal_status: bool

class StudentResponse(StudentBase):
    class Config:
        from_attributes = True

# Room Schemas
class RoomBase(BaseModel):
    id: str
    name: str
    capacity: int
    location: Optional[str] = None
    is_available: bool

class RoomResponse(RoomBase):
    class Config:
        from_attributes = True

# Interview Schemas
class InterviewResponse(BaseModel):
    id: str
    version_id: int
    student_id: str
    company_id: str
    panel_index: Optional[int] = None
    room_id: Optional[str] = None
    day: Optional[int] = None
    start_time: Optional[int] = None
    end_time: Optional[int] = None
    status: str
    failure_reason: Optional[str] = None
    blocking_constraint: Optional[str] = None

    class Config:
        from_attributes = True

# Schedule Version Schemas
class ScheduleVersionResponse(BaseModel):
    id: int
    name: str
    created_at: datetime
    is_active: bool

    class Config:
        from_attributes = True

# Disruption Input Schemas
class CompanyDelayInput(BaseModel):
    company_id: str
    day: int
    delay_minutes: int

class PanelDropoutInput(BaseModel):
    company_id: str
    panel_index: int
    day: int
    start_time: int
    end_time: int

class StudentWithdrawalInput(BaseModel):
    student_id: str

class RoomUnavailableInput(BaseModel):
    room_id: str
    day: int
    start_time: int
    end_time: int

# Change Diff Schemas
class ScheduleChangeDetail(BaseModel):
    interview_id: str
    student_id: str
    student_name: str
    company_id: str
    company_name: str
    change_type: str  # MOVED, CANCELLED, ADDED, UNCHANGED
    old_start_time: Optional[int] = None
    old_room_id: Optional[str] = None
    old_panel: Optional[int] = None
    new_start_time: Optional[int] = None
    new_room_id: Optional[str] = None
    new_panel: Optional[int] = None
    reason: Optional[str] = None
    impact: Optional[str] = None

class ReplanSummaryResponse(BaseModel):
    event_id: int
    disruption_type: str
    timestamp: datetime
    old_version_id: int
    new_version_id: int
    appointments_moved: int
    appointments_cancelled: int
    appointments_added: int
    appointments_unchanged: int
    students_notified: int
    rooms_affected: int
    panels_affected: int
    estimated_disruption: str  # LOW, MEDIUM, HIGH
    changes: List[ScheduleChangeDetail] = []

# Metrics Schemas
class DashboardMetricsResponse(BaseModel):
    total_eligible_interviews: int
    scheduled_count: int
    unscheduled_count: int
    completion_percentage: float
    student_clashes_count: int
    room_utilization_percentage: float
    panel_utilization_percentage: float
    average_waiting_time_minutes: float
    replan_churn_percentage: float

# Notification Schemas
class NotificationResponse(BaseModel):
    id: int
    version_id: int
    recipient_type: str
    recipient_id: str
    message: str
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True
