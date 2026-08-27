import sqlite3
import bcrypt
import secrets
import csv
import sys

db_path = "/app/data/ai-club.db"
csv_path = "/app/data/temp_passwords.csv"

def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Get all members
cursor.execute("SELECT id, name, email, intra_username FROM users WHERE role='member'")
members = cursor.fetchall()

if not members:
    print("No members found.")
    sys.exit(0)

results = []
for member in members:
    user_id, name, email, intra = member
    if email == 'mmmmfathy7@gmail.com' or intra == 'test':
        continue # Skip test users
    
    # Generate a random 8 char password that meets requirements
    # (uppercase, lowercase, digit)
    temp_pass = secrets.token_urlsafe(6) + "A1!"
    hashed = _hash_password(temp_pass)
    
    cursor.execute("UPDATE users SET password_hash=? WHERE id=?", (hashed, user_id))
    results.append({
        "Name": name,
        "Email": email,
        "Intra": intra,
        "Temporary_Password": temp_pass
    })

conn.commit()
conn.close()

with open(csv_path, 'w', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=["Name", "Email", "Intra", "Temporary_Password"])
    writer.writeheader()
    writer.writerows(results)

print(f"Generated new passwords for {len(results)} students.")
for r in results:
    print(f"{r['Name']} ({r['Intra']}) - {r['Email']} -> Password: {r['Temporary_Password']}")
