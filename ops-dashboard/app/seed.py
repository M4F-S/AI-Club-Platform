"""Seed the initial admin user. Run once: docker exec hermes-ops python -m app.seed"""
import getpass, secrets, string
from . import core

def seed_admin():
    core.init_db()
    if core.get_user("admin"):
        print("admin already exists — skipping. Use /api/password to rotate.")
        return
    # password from env NEXUS_ADMIN_PASSWORD or auto-generate and print once
    import os
    pw = os.environ.get("NEXUS_ADMIN_PASSWORD")
    if not pw:
        pw = "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(16))
        print("GENERATED ADMIN PASSWORD:", pw)
    if core.create_user("admin", pw, "admin"):
        print("admin created with role=admin")
    else:
        print("ERROR: could not create admin")

if __name__ == "__main__":
    seed_admin()
