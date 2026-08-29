from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, DateTime, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from backend.app.database import Base

class Company(Base):
    __tablename__ = "companies"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    priority_tier = Column(Integer, default=3)  # Tier 1, 2, 3
    cgpa_cutoff = Column(Float, default=0.0)
    interview_duration = Column(Integer, default=30)  # in minutes
    panel_count = Column(Integer, default=1)
    expected_shortlist_count = Column(Integer, default=0)
    preferred_days = Column(String, nullable=True)  # e.g., "1,2"

    availabilities = relationship("CompanyAvailability", back_populates="company", cascade="all, delete-orphan")
    interviews = relationship("Interview", back_populates="company", cascade="all, delete-orphan")

class Student(Base):
    __tablename__ = "students"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    branch = Column(String, nullable=False)
    cgpa = Column(Float, nullable=False)
    graduation_year = Column(Integer, nullable=False)
    shortlisted_companies = Column(String, nullable=True)  # comma-separated company IDs
    placement_status = Column(String, default="UNPLACED")  # UNPLACED, PLACED, WITHDRAWN
    withdrawal_status = Column(Boolean, default=False)

    interviews = relationship("Interview", back_populates="student", cascade="all, delete-orphan")

class Room(Base):
    __tablename__ = "rooms"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    capacity = Column(Integer, default=1)
    location = Column(String, nullable=True)
    is_available = Column(Boolean, default=True)

    interviews = relationship("Interview", back_populates="room", cascade="all, delete-orphan")

class CompanyAvailability(Base):
    __tablename__ = "company_availabilities"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    company_id = Column(String, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    day = Column(Integer, nullable=False)  # 1, 2, 3, 4
    start_time = Column(Integer, nullable=False)  # minutes from day start (e.g. 540 for 09:00 AM)
    end_time = Column(Integer, nullable=False)  # minutes from day start (e.g. 1020 for 05:00 PM)

    company = relationship("Company", back_populates="availabilities")

class ScheduleVersion(Base):
    __tablename__ = "schedule_versions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=False)

    interviews = relationship("Interview", back_populates="version", cascade="all, delete-orphan")
    notifications = relationship("Notification", back_populates="version", cascade="all, delete-orphan")

class Interview(Base):
    __tablename__ = "interviews"

    id = Column(String, primary_key=True, index=True)  # Composite/Unique ID
    version_id = Column(Integer, ForeignKey("schedule_versions.id", ondelete="CASCADE"), nullable=False)
    student_id = Column(String, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    company_id = Column(String, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    panel_index = Column(Integer, nullable=True)  # 1 to panel_count
    room_id = Column(String, ForeignKey("rooms.id", ondelete="CASCADE"), nullable=True)
    day = Column(Integer, nullable=True)
    start_time = Column(Integer, nullable=True)  # minutes from day start
    end_time = Column(Integer, nullable=True)  # minutes from day start
    status = Column(String, default="UNSCHEDULED")  # SCHEDULED, UNSCHEDULED
    failure_reason = Column(String, nullable=True)  # for explainability
    blocking_constraint = Column(String, nullable=True)  # e.g., STUDENT_CONFLICT, ROOM_CONFLICT, etc.

    version = relationship("ScheduleVersion", back_populates="interviews")
    student = relationship("Student", back_populates="interviews")
    company = relationship("Company", back_populates="interviews")
    room = relationship("Room", back_populates="interviews")

class DisruptionEvent(Base):
    __tablename__ = "disruption_events"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    disruption_type = Column(String, nullable=False)  # COMPANY_DELAY, PANEL_DROPOUT, STUDENT_WITHDRAWAL, ROOM_UNAVAILABLE
    parameters = Column(Text, nullable=False)  # JSON string of disruption parameters
    old_version_id = Column(Integer, ForeignKey("schedule_versions.id"), nullable=True)
    new_version_id = Column(Integer, ForeignKey("schedule_versions.id"), nullable=True)

    changes = relationship("ScheduleChange", back_populates="disruption_event", cascade="all, delete-orphan")

class ScheduleChange(Base):
    __tablename__ = "schedule_changes"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    disruption_event_id = Column(Integer, ForeignKey("disruption_events.id", ondelete="CASCADE"), nullable=False)
    interview_id = Column(String, nullable=False)
    change_type = Column(String, nullable=False)  # MOVED, CANCELLED, ADDED, UNCHANGED
    
    old_start_time = Column(Integer, nullable=True)
    old_room_id = Column(String, nullable=True)
    old_panel = Column(Integer, nullable=True)
    
    new_start_time = Column(Integer, nullable=True)
    new_room_id = Column(String, nullable=True)
    new_panel = Column(Integer, nullable=True)
    
    reason = Column(String, nullable=True)
    impact = Column(String, nullable=True)

    disruption_event = relationship("DisruptionEvent", back_populates="changes")

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    version_id = Column(Integer, ForeignKey("schedule_versions.id", ondelete="CASCADE"), nullable=False)
    recipient_type = Column(String, nullable=False)  # STUDENT, COMPANY, PANEL, COORDINATOR
    recipient_id = Column(String, nullable=False)  # ID of recipient
    message = Column(String, nullable=False)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    version = relationship("ScheduleVersion", back_populates="notifications")
