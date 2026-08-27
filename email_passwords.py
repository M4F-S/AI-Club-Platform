import sqlite3
import csv
import smtplib
from email.mime.text import MIMEText

db_path = "/app/data/ai-club.db"
csv_path = "/app/data/temp_passwords.csv"

# Fetch users created today
conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute("SELECT email, name FROM users WHERE role='member' AND created_at >= '2026-08-20';")
today_users = {row[0]: row[1] for row in cursor.fetchall()}
conn.close()

# Read passwords
user_passwords = {}
with open(csv_path, 'r') as f:
    reader = csv.DictReader(f)
    for row in reader:
        if row['Email'] in today_users:
            user_passwords[row['Email']] = {
                'name': today_users[row['Email']],
                'intra': row['Intra'],
                'password': row['Temporary_Password']
            }

SMTP_HOST = "smtp.hostinger.com"
SMTP_PORT = 465
SMTP_USER = "contact@42berlinaiclub.de"
SMTP_PASSWORD = "Aiclub@42"

print(f"Sending emails to {len(user_passwords)} users...")

try:
    with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT) as server:
        server.login(SMTP_USER, SMTP_PASSWORD)
        
        for email, info in user_passwords.items():
            subject = "Your 42 Berlin AI Club membership is approved"
            body = f"Hi {info['name']},\n\nYour membership has been approved.\n\nLogin: https://42berlinaiclub.de/login.html\nUsername: {email} (or {info['intra']})\nTemporary password: {info['password']}\n\nPlease change your password after first login.\n\nBest,\n42 Berlin AI Club"
            
            msg = MIMEText(body, "plain", "utf-8")
            msg["Subject"] = subject
            msg["From"] = SMTP_USER
            msg["To"] = email
            
            server.send_message(msg)
            print(f"Sent email to {email}")
            
    print("All emails sent successfully!")
except Exception as e:
    print(f"Error sending emails: {e}")
