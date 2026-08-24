# Placement Week Scheduling & Replanning System

A production-quality take-home assessment solution for the Software Developer Intern role at Mirai Labs. This system generates initial scheduling layouts for placement week activities and enables coordinators to perform real-time, minimal-churn replanning when disruptions occur (such as late company arrivals, dropped panels, withdrawn students, and room outages).

---

## 1. System Architecture

The application is structured following Clean Architecture principles:

```
├── backend/
│   ├── app/
│   │   ├── api/          # FastAPI REST endpoints
│   │   ├── models/       # SQLAlchemy DB entities
│   │   ├── schemas/      # Pydantic schemas for request/response serialization
│   │   ├── scheduler/    # Hard & Soft Constraint validator and greedy scheduler
│   │   ├── replanner/    # Disruption event solvers & diff log generator
│   │   ├── metrics/      # KPI calculator (completion, wait time, utilization, churn)
│   │   ├── database.py   # SQLAlchemy SQLite connection setup
│   │   └── main.py       # FastAPI application entrypoint
│   └── requirements.txt  # Python requirements
├── frontend/
│   ├── src/
│   │   ├── App.tsx       # Main dashboard layout and state controller
│   │   ├── index.css     # Global glassmorphic stylesheet
│   │   └── main.tsx      # Vite entrypoint
│   └── Dockerfile
├── scripts/
│   ├── generate_data.py  # Seeded synthetic data generator (students, rooms, companies)
│   └── generate_schedule.py # Runs initial schedule generation from CLI
├── tests/                # Pytest unit & integration tests
└── docker-compose.yml    # Runs application inside containers
```

---

## 2. Getting Started (Setup)

Ensure you have **Python 3.10+** and **Node.js 18+** installed.

### Option A: Local Local Setup

#### Step 1: Backend Setup
```bash
# Navigate to project root, create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install requirements
pip install -r backend/requirements.txt

# Seed the database with 800 students, 35 companies, and 20 rooms (Seed: 42)
python scripts/generate_data.py --seed 42

# Generate the initial schedule (Version 1)
python scripts/generate_schedule.py

# Start the backend server
python backend/app/main.py
```
The backend API is now running at `http://localhost:8000`. You can access the auto-generated Swagger API documentation at `http://localhost:8000/docs`.

#### Step 2: Frontend Setup
```bash
# In a new terminal window, navigate to frontend
cd frontend
npm install

# Run the dev server
npm run dev
```
The React coordinator dashboard is now available at `http://localhost:5173`.

---

### Option B: Docker Compose Setup
To run both services in Docker with one command:
```bash
docker compose up --build
```
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000`

---

## 3. Core Algorithms & Logic

### Initial Scheduling Engine
The scheduler follows a **Deterministic Greedy Priority Heuristic**:
1. **Shortlist Generation**: Candidate interviews are derived from eligible student-company pairings (filtering out students whose CGPA is below the company cutoff).
2. **Sorting Logic**: All pairings are sorted by:
   - *Company Priority Tier* (Tier 1 first, then Tier 2, then Tier 3).
   - *Student Shortlist Count* (descending: students with more shortlists are scheduled first, minimizing downstream blockages).
   - *Student CGPA* (descending).
3. **Slot Assignment**: The engine evaluates 15-minute slot intervals from 09:00 to 17:00 across available days:
   - Checks **Hard Constraints**: Student conflicts, room conflicts, panel conflicts, company slot bounds.
   - Calculates **Soft Penalty**: `Penalty = Waiting Time + Travel Distance + Preferred Day Penalty`.
   - The slot with the lowest penalty score is assigned. Unscheduled items are logged with explanations.

### Replanning Engine (Minimal-Churn Heuristic)
When a disruption happens:
1. The engine copies the active schedule version to a new version (allowing full historical version control).
2. Directly affected interviews (e.g. scheduled in a room during an outage window) are vacated and marked `UNSCHEDULED`.
3. All other interviews remain locked in their original slots, guaranteeing zero cascade churn.
4. For each vacated interview (sorted by priority):
   - **Phase A**: Try to find a completely free, valid slot (zero churn!).
   - **Phase B (Ripple Search)**: If no free slot exists, attempt to displace a lower-priority company's interview to a free slot to claim its space.
   - If both fail, the interview is marked `UNSCHEDULED` with the blocking resource documented.

---

## 4. Live Technical Defense Preparation

### 1. Why this scheduling algorithm?
We use a deterministic greedy priority search rather than a heavy MILP solver or machine learning model. This ensures that the scheduling outcomes are 100% predictable, reproducible, and explains *exactly* why an interview was placed (or not placed) at any slot, which is crucial for a coordinator explaining plans to students.

### 2. What are the hard vs. soft constraints?
- **Hard**: Student conflict (no overlaps), room conflict (no overlaps), panel conflict (no panel does 2 interviews at once), student eligibility (CGPA >= cutoff), student withdrawal (must not run).
- **Soft**: Student waiting time, room change travel (prefer same room back-to-back), preferred company placement days.

### 3. How do you minimize replan churn?
By locking all unaffected interviews. Directly affected ones are vacated. We search for empty slots first. If none, we perform a 1-level displacement of lower-priority company interviews to other free slots. This bounds the maximum churn and guarantees that we only move the minimum number of interviews required.

### 4. What happens if multiple disruptions occur?
Our version control system handles sequential disruptions naturally. Since every replan event takes the latest active version, applies modifications, and outputs a new version (e.g. Version 1 -> Version 2 -> Version 3), multiple disruptions are stacked without conflict.

### 5. How would you scale this to 10,000 students?
For 10,000 students, search space scales. We would:
1. Index schedules using interval trees (such as segment trees) in memory to run overlap queries in $O(\log N)$ instead of $O(N)$.
2. Segment the scheduling space by company priority or branch groups (e.g. CS students first, core departments separately) to run local scheduling sub-problems in parallel.
3. Move checker state to a fast Redis cache or in-memory DB.
