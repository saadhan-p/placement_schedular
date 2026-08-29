import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

import urllib.parse

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///backend/placement_scheduler.db")

# Handle Vercel/Supabase 'postgres://' connection string format deprecated in SQLAlchemy
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Safely encode special characters in the database password (common Supabase connection string issue)
if DATABASE_URL.startswith("postgresql"):
    try:
        url_obj = urllib.parse.urlparse(DATABASE_URL)
        if url_obj.password:
            encoded_password = urllib.parse.quote_plus(url_obj.password)
            userinfo = f"{url_obj.username}:{encoded_password}"
            if url_obj.port:
                netloc = f"{userinfo}@{url_obj.hostname}:{url_obj.port}"
            else:
                netloc = f"{userinfo}@{url_obj.hostname}"
            DATABASE_URL = urllib.parse.urlunparse(
                url_obj._replace(netloc=netloc)
            )
    except Exception as e:
        print(f"Error parsing/encoding DATABASE_URL: {e}")

# Check if database is SQLite to apply connection parameters
is_sqlite = DATABASE_URL.startswith("sqlite")

connect_args = {}
if is_sqlite:
    # Ensure the backend directory exists
    os.makedirs("backend", exist_ok=True)
    connect_args["check_same_thread"] = False

engine = create_engine(
    DATABASE_URL, 
    connect_args=connect_args
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
