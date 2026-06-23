"""Seed the first superadmin account."""
import os
import secrets
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bcrypt
from app import app
from config import Config
from models import User, db


def create_admin(email: str, password: str | None = None, name: str = "Admin") -> tuple[str, str]:
    with app.app_context():
        existing = User.query.filter_by(email=email).first()
        if existing:
            print(f"Admin with email {email} already exists.")
            return email, None

        if not password:
            password = secrets.token_urlsafe(16)

        password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")
        admin = User(
            email=email,
            name=name,
            password_hash=password_hash,
            role="superadmin",
            is_active=True,
        )
        db.session.add(admin)
        db.session.commit()
        return email, password


if __name__ == "__main__":
    email = os.environ.get("ADMIN_EMAIL", Config.ADMIN_EMAIL)
    password = os.environ.get("ADMIN_INITIAL_PASSWORD")

    admin_email, generated_password = create_admin(email, password, name="Mohamed Fathy")
    if generated_password:
        print(f"Created superadmin: {admin_email}")
        print(f"Temporary password: {generated_password}")
        print("Change this password after first login.")
