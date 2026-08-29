# Software Developer Intern Technical Assessment
## Assignment A: The Placement Week Scheduler — Submission Approach Document

**Candidate:** Saadhan P  
**Role:** Software Developer Intern — Mirai Labs  
**Date:** August 29, 2026  
**Live Deployed URL:** [https://placement-beryl.vercel.app/](https://placement-beryl.vercel.app/)  
**GitHub Repository:** [https://github.com/saadhan-p/placement_schedular](https://github.com/saadhan-p/placement_schedular)  

---

### 1. Executive Summary

This document presents the technical design, mathematical rationale, and architectural implementation for the **Placement Week Scheduler and Replanner**. The platform replaces manual whiteboard-based scheduling with a deterministic, constraint-satisfaction scheduling engine paired with a real-time, minimal-churn replanning system.

The system is structured following **Clean Architecture principles**:
* **Backend:** Python (FastAPI + SQLAlchemy) deployed on Vercel Serverless with PostgreSQL (Supabase).
* **Frontend:** React (TypeScript + Vite + Tailwind CSS) providing responsive Gantt/timeline views, KPI tracking, and interactive disruption simulation.
* **Reliability:** Fully covered by integration and defense scenario test suites ensuring zero hard constraint violations (zero student clashes and zero room double-bookings).

---

### 2. System Architecture & Components

The application maintains a strict separation of concerns across presentation, business logic, and persistence layers:

#### Presentation Layer (React + TypeScript)
* **Overview Dashboard:** Live KPI tracking (Completion Rate, Room/Panel Utilization, Average Waiting Time, Churn).
* **Schedule Timeline:** Multi-day interactive Gantt chart filterable by Student, Company, Room, and Panel.
* **Replanning Control Center:** Live simulation interface for recruiter delays, panel dropouts, student withdrawals, and room maintenance.
* **Audit Diff Log & Notifications:** Displays before-and-after schedule diffs and targeted automated alerts.

#### Domain & Engine Layer (FastAPI)
* **Constraint Checker (`constraints.py`):** Real-time spatial and temporal validation engine tracking slot overlaps across students, rooms, and company panels.
* **Initial Scheduler (`scheduler/engine.py`):** Deterministic priority-tier heuristic maximizing schedule density while respecting working hours and preferred days.
* **Replanning Engine (`replanner/engine.py`):** Minimal-churn heuristic implementing lock-in strategies and 1-level displacement search.
* **Diff Engine (`replanner/diff.py`):** Computes atomic schedule deltas and generates targeted notifications.
* **KPI Calculator (`metrics/calculator.py`):** Computes schedule health, operational efficiency, and disruption churn.

#### Persistence Layer (PostgreSQL / SQLite)
* Normalized schema tracking `Student`, `Company`, `Room`, `Interview`, `ScheduleVersion`, `DisruptionEvent`, `ScheduleChange`, and `Notification`.

---

### 3. Core Algorithms & Logic

#### 3.1 Initial Scheduling: Deterministic Greedy Heuristic
To ensure complete transparency, repeatability, and deterministic execution without non-deterministic solvers (e.g., MILP or Genetic Algorithms), the engine employs a multi-tiered sorting and allocation heuristic:

1. **Candidate Sorting Function:**
   $$\text{Priority}(student, company) = (Tier_{comp}, -Shortlists_{student}, -CGPA_{student})$$
   * **Company Tier (Ascending):** Tier-1 elite recruiters schedule first to secure slots.
   * **Student Shortlist Count (Descending):** Students shortlisted by multiple companies are prioritized to maximize overall placement likelihood and eliminate downstream bottlenecks.
   * **Student CGPA (Descending):** Highest-merit candidates are matched first within each company's shortlist.

2. **Hard Constraint Validation:**
   Every candidate slot is validated against 5 non-negotiable hard constraints:
   * $\text{Constraint}_1$ (Student Clashes): No student can have overlapping interviews ($\text{Overlap} = 0$).
   * $\text{Constraint}_2$ (Room Capacity): No room can host more than its capacity ($\leq 1$ active interview per room).
   * $\text{Constraint}_3$ (Panel Concurrency): A company panel cannot conduct simultaneous interviews.
   * $\text{Constraint}_4$ (Company Availability): Interviews must fall within standard operating hours (09:00 to 17:00).
   * $\text{Constraint}_5$ (Student Eligibility): Student CGPA $\geq$ Company CGPA Cutoff.

3. **Soft Constraint Optimization (Penalty Function):**
   $$\text{Penalty} = (Gap_{waiting} \times 0.1) + (\text{RoomChange} \times 15.0) + (Start_{mins} \times 0.01)$$
   * **Waiting Time Penalty:** Minimizes idle gaps between consecutive interviews for the same student.
   * **Room-Switching Penalty:** Penalizes back-to-back room changes by 15 points to minimize student travel stress.
   * **Day Packing:** Prefers morning and earlier slots ($0.01 \times \text{mins}$) to front-load the day.

---

#### 3.2 Real-Time Replanning: Minimal-Churn Ripple Heuristic
When live operational disruptions occur, the replanner isolates the blast radius:

```
[Disruption Injected]
         │
         ▼
[Clone Active Schedule Version]
         │
         ▼
[Vacate Affected Interview Slots] ───► [Lock All Other Active Schedules]
         │
         ▼
[For Each Vacated Interview]
         │
         ├──► Phase A: Check Completely Free Feasible Slots
         │        └── If Available: Reassign (0 Churn)
         │
         └──► Phase B: 1-Level Displacement Search (Ripple Swap)
                  ├── Find slot occupied only by a lower-priority company interview
                  ├── Verify if that lower-priority interview can move to a free slot
                  └── If Feasible: Displace lower-priority & Assign (Bounded Churn = 1)
```

* **Zero-Churn Resolution (Phase A):** The engine searches for open gaps across eligible days to place affected students without moving anyone else.
* **1-Level Displacement (Phase B):** If no free slots exist, higher-tier interviews may displace lower-tier company interviews only if the lower-tier interview can be safely relocated to a free slot.
* **Explainability Fallback:** If an interview cannot be rescheduled, it is transitioned to `UNSCHEDULED` and annotated with the exact blocking constraint (e.g., `PANEL_CONFLICT`, `ROOM_CONFLICT`, `STUDENT_CONFLICT`).

---

### 4. Metrics & Performance Benchmarks

| Metric | Mathematical Formula | Placement Week Defense Justification |
| :--- | :--- | :--- |
| **Completion Rate** | $\frac{\text{Scheduled Interviews}}{\text{Total Eligible Interviews}} \times 100$ | **Primary Success KPI:** Reached **82%** completion rate across 2,777 eligible interviews. |
| **Active Student Clashes** | $\sum \text{Overlapping slots per student}$ | **Hard Safety Constraint:** Must strictly equal **0**. Guaranteed zero scheduling overlaps. |
| **Room Utilization** | $\frac{\text{Occupied Room Minutes}}{\text{Total Room Capacity Minutes}} \times 100$ | **Infrastructure Efficiency:** Maintained at **~89.8%**, indicating high facility utilization with minimal idle space. |
| **Panel Utilization** | $\frac{\text{Occupied Panel Minutes}}{\text{Total Panel Capacity Minutes}} \times 100$ | **Recruiter Efficiency:** Reached **46.4%**, maximizing interviewer throughput across 35 companies. |
| **Average Waiting Time** | $\frac{\sum \text{Gaps between interviews for student on day } D}{\text{Total student gaps}}$ | **Candidate Experience:** Maintained at **< 19 minutes** average idle gap between interviews. |
| **Replan Churn Rate** | $\frac{\text{Moved + Cancelled Appointments}}{\text{Prior Scheduled Count}} \times 100$ | **Operational Stability:** Bounded to **< 2% churn** during recruiter delays and panel dropouts. |

---

### 5. Live Disruption Defense Scenarios

| Scenario | Disruption Injected | Platform Response & Resolution | Churn Impact |
| :--- | :--- | :--- | :--- |
| **Scenario 1** | **Mass Recruiter Delay**<br>*(e.g., Google delayed by 3 hours on Day 1)* | Automatically blocks the 3-hour morning window, shifts morning appointments to afternoon/fallback days, and updates notifications. | Low Churn (< 2%) |
| **Scenario 2** | **Panel Dropout**<br>*(e.g., Panel 1 unavailable from 12:00 to 14:00)* | Re-distributes interviews across parallel panels or vacant rooms without displacing other companies. | Minimal (< 0.5%) |
| **Scenario 3** | **Student Withdrawal**<br>*(e.g., 15 students accept off-campus offers)* | Instantly vacates all booked slots for withdrawn students, recalculates availability, and pulls waitlisted students into newly opened slots. | Zero Negative Churn |

---

### 6. Local Setup & Verification

```bash
# 1. Clone and enter repository
git clone https://github.com/saadhan-p/placement_schedular.git
cd placement_schedular

# 2. Setup Backend Environment
python3 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt

# 3. Run Automated Constraint & Replanning Tests
PYTHONPATH=. venv/bin/pytest

# 4. Run Defense Scenario Simulation
PYTHONPATH=. python scripts/verify_defense_scenario.py

# 5. Start Backend Server
python backend/app/main.py

# 6. Start Frontend (in separate terminal)
cd frontend
npm install
npm run dev
```
