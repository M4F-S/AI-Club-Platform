"""42 Berlin AI Club API."""
import re
import os
import uuid
import json
import secrets
import hashlib
import smtplib
from datetime import datetime, timezone, timedelta
from email.mime.text import MIMEText
from functools import wraps

import bcrypt
from flask import Flask, jsonify, request, session
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from werkzeug.middleware.proxy_fix import ProxyFix

from config import Config
from models import (
    Application,
    BlogPost,
    ContactMessage,
    Event,
    EventMaterial,
    PartnerInquiry,
    QuizAttempt,
    QuizQuestion,
    Resource,
    User,
    db,
    utcnow,
)


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

    db.init_app(app)

    limiter = Limiter(
        get_remote_address,
        app=app,
        default_limits=["200 per day", "50 per hour"],
        storage_uri=Config.RATE_LIMIT_STORAGE,
    )
    app.limiter = limiter

    with app.app_context():
        db.create_all()

    @app.before_request
    def csrf_check():
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return None
        if not _origin_ok():
            return jsonify({"error": "Invalid origin"}), 403
        return None

    @app.errorhandler(429)
    def ratelimit_handler(e):
        return jsonify({"error": "Too many requests. Please slow down."}), 429

    @app.errorhandler(500)
    def internal_error(e):
        db.session.rollback()
        return jsonify({"error": "Internal server error"}), 500


    @app.after_request
    def set_security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()"
        csp = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com data:; "
            "img-src 'self' data: blob:; "
            "connect-src 'self'; "
            "frame-ancestors 'none'; "
            "base-uri 'self'; "
            "form-action 'self';"
        )
        response.headers["Content-Security-Policy"] = csp
        return response

    return app


app = create_app()
limiter = app.limiter


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def _check_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


def _generate_password(length: int = 16) -> str:
    return secrets.token_urlsafe(length)


def _is_valid_email(email: str) -> bool:
    return re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email) is not None


import threading

def _send_email_sync(subject: str, body: str, to: str) -> bool:
    """Send email synchronously using the correct protocol for the port."""
    cfg = Config()
    if not cfg.SMTP_HOST or not cfg.SMTP_USER or not cfg.SMTP_PASSWORD:
        app.logger.info("SMTP not configured; skipping email to %s", to)
        return False
    try:
        msg = MIMEText(body, "plain", "utf-8")
        msg["Subject"] = subject
        msg["From"] = cfg.SMTP_USER
        msg["To"] = to

        # Use SMTP_SSL for port 465, SMTP+STARTTLS for port 587
        if cfg.SMTP_PORT == 465:
            with smtplib.SMTP_SSL(cfg.SMTP_HOST, cfg.SMTP_PORT, timeout=10) as server:
                server.login(cfg.SMTP_USER, cfg.SMTP_PASSWORD)
                server.sendmail(cfg.SMTP_USER, [to], msg.as_string())
        else:
            with smtplib.SMTP(cfg.SMTP_HOST, cfg.SMTP_PORT, timeout=10) as server:
                server.starttls()
                server.login(cfg.SMTP_USER, cfg.SMTP_PASSWORD)
                server.sendmail(cfg.SMTP_USER, [to], msg.as_string())
        app.logger.info("Email sent successfully to %s", to)
        return True
    except Exception as e:
        app.logger.exception("Failed to send email to %s: %s", to, e)
        return False

def _send_email(subject: str, body: str, to: str) -> bool:
    """Send email asynchronously in a background thread so API responses are fast."""
    cfg = Config()
    if not cfg.SMTP_HOST or not cfg.SMTP_USER or not cfg.SMTP_PASSWORD:
        app.logger.info("SMTP not configured; skipping email to %s", to)
        return False
    # Fire-and-forget background thread for non-blocking email
    thread = threading.Thread(
        target=_send_email_sync,
        args=(subject, body, to),
        daemon=True,
        name=f"email-{to}"
    )
    thread.start()
    app.logger.info("Email queued for %s (sending in background)", to)
    return True


def _origin_ok() -> bool:
    """Basic CSRF check: exact hostname matching - no prefix attacks allowed."""
    origin = request.headers.get("Origin") or request.headers.get("Referer") or ""
    if not origin:
        return True
    try:
        from urllib.parse import urlparse
        parsed = urlparse(origin)
        allowed_hosts = {"mysophia.tech", "www.mysophia.tech", "42berlinaiclub.de", "www.42berlinaiclub.de"}
        return parsed.hostname in allowed_hosts
    except Exception:
        return False


def _current_user() -> User | None:
    user_id = session.get("user_id")
    if not user_id:
        return None
    return User.query.get(user_id)


def _require_login(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        user = _current_user()
        if not user or not user.is_active:
            return jsonify({"error": "Authentication required"}), 401
        request.current_user = user
        return f(*args, **kwargs)
    return decorated


def _require_admin(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        user = _current_user()
        if not user or not user.is_active or user.role not in ("member", "admin", "superadmin"):
            return jsonify({"error": "Admin access required"}), 403
        request.current_user = user
        return f(*args, **kwargs)
    return decorated


def _require_superadmin(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        user = _current_user()
        if not user or not user.is_active or user.role != "superadmin":
            return jsonify({"error": "Superadmin access required"}), 403
        request.current_user = user
        return f(*args, **kwargs)
    return decorated


# ---------------------------------------------------------------------------
# Public / health
# ---------------------------------------------------------------------------

@app.get("/health")
@limiter.exempt
def health():
    return jsonify({"status": "ok"}), 200


@app.get("/stats")
@limiter.exempt
def public_stats():
    return jsonify({
        "members": User.query.filter_by(is_active=True).count(),
        "events": Event.query.filter_by(event_type="event").count(),
        "projects": Resource.query.count(),
        "workshops": Event.query.filter_by(event_type="workshop").count(),
    }), 200


# ---------------------------------------------------------------------------
# Applications
# ---------------------------------------------------------------------------

@app.post("/apply")
@limiter.limit("3 per hour")
def apply():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    intra = (data.get("intra_username") or "").strip().lower()
    email = (data.get("email") or "").strip().lower()
    level = (data.get("level") or "").strip()
    message = (data.get("message") or "").strip()

    if not name or not intra or not email:
        return jsonify({"error": "Name, 42 intra username, and email are required."}), 400
    if not _is_valid_email(email):
        return jsonify({"error": "Please provide a valid email address."}), 400

    existing_user = User.query.filter(
        (User.email == email) | (User.intra_username == intra)
    ).first()
    if existing_user:
        return jsonify({"error": "An account with this email or intra username already exists."}), 409

    existing_app = Application.query.filter(
        (Application.email == email) | (Application.intra_username == intra)
    ).filter(Application.status == "pending").first()
    if existing_app:
        return jsonify({"error": "You already have a pending application."}), 409

    application = Application(
        name=name,
        intra_username=intra,
        email=email,
        level=level,
        message=message,
        status="pending",
    )
    db.session.add(application)
    db.session.commit()

    _send_email(
        subject="New 42 Berlin AI Club member application",
        body=f"Name: {name}\nIntra: {intra}\nEmail: {email}\nLevel: {level}\nMessage:\n{message}\n\nReview at https://42berlinaiclub.de/admin.html",
        to=Config.ADMIN_EMAIL,
    )

    return jsonify({"message": "Application submitted successfully."}), 201


# ---------------------------------------------------------------------------
# Contact
# ---------------------------------------------------------------------------

@app.post("/contact")
@limiter.limit("5 per hour")
def contact():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    message = (data.get("message") or "").strip()

    if not name or not email or not message:
        return jsonify({"error": "Name, email, and message are required."}), 400
    if not _is_valid_email(email):
        return jsonify({"error": "Please provide a valid email address."}), 400

    msg = ContactMessage(name=name, email=email, message=message)
    db.session.add(msg)
    db.session.commit()

    _send_email(
        subject="New message from 42 Berlin AI Club website",
        body=f"From: {name} <{email}>\n\n{message}",
        to=Config.ADMIN_EMAIL,
    )

    return jsonify({"message": "Message sent successfully."}), 201


# ---------------------------------------------------------------------------
# Partner inquiries
# ---------------------------------------------------------------------------

@app.post("/partner")
@limiter.limit("5 per hour")
def partner():
    data = request.get_json(silent=True) or {}
    organization = (data.get("organization") or "").strip()
    contact_name = (data.get("contact_name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    partnership_type = (data.get("partnership_type") or "").strip()
    message = (data.get("message") or "").strip()

    if not organization or not contact_name or not email or not partnership_type:
        return jsonify({"error": "Organization, contact name, email, and partnership type are required."}), 400
    if not _is_valid_email(email):
        return jsonify({"error": "Please provide a valid email address."}), 400

    inquiry = PartnerInquiry(
        organization=organization,
        contact_name=contact_name,
        email=email,
        partnership_type=partnership_type,
        message=message,
    )
    db.session.add(inquiry)
    db.session.commit()

    _send_email(
        subject="New 42 Berlin AI Club partnership inquiry",
        body=f"Organization: {organization}\nContact: {contact_name}\nEmail: {email}\nType: {partnership_type}\n\n{message}",
        to=Config.ADMIN_EMAIL,
    )

    return jsonify({"message": "Inquiry submitted successfully."}), 201


# ---------------------------------------------------------------------------
# Admin auth
# ---------------------------------------------------------------------------

@app.post("/admin/login")
@limiter.limit("60 per hour")
def admin_login():
    data = request.get_json(silent=True) or {}
    login = (data.get("email") or data.get("username") or data.get("intra_username") or "").strip().lower()
    password = data.get("password") or ""

    if not login or not password:
        return jsonify({"error": "Username/email and password are required."}), 400

    user = User.query.filter(
        (User.email == login) | (User.intra_username == login)
    ).first()
    if not user or not user.is_active or user.role not in ("member", "admin", "superadmin"):
        return jsonify({"error": "Invalid email or password"}), 401
    if not _check_password(password, user.password_hash):
        return jsonify({"error": "Invalid email or password"}), 401

    session.permanent = True
    session["user_id"] = user.id
    session["role"] = user.role
    return jsonify({"user": user.to_dict()}), 200


@app.post("/admin/logout")
@_require_admin
def admin_logout():
    session.clear()
    return jsonify({"message": "Logged out"}), 200


@app.get("/admin/me")
@_require_admin
def admin_me():
    return jsonify({"user": request.current_user.to_dict(include_email=False)}), 200


# ---------------------------------------------------------------------------
# Admin application management
# ---------------------------------------------------------------------------

@app.get("/admin/applications")
@_require_admin
def list_applications():
    status = request.args.get("status", "pending")
    if status not in ("pending", "approved", "rejected"):
        return jsonify({"error": "Invalid status"}), 400
    apps = Application.query.filter_by(status=status).order_by(Application.created_at.desc()).all()
    return jsonify([a.to_dict() for a in apps]), 200


@app.post("/admin/approve")
@_require_admin
def approve_application():
    data = request.get_json(silent=True) or {}
    app_id = data.get("application_id")
    application = Application.query.get(app_id)
    if not application or application.status != "pending":
        return jsonify({"error": "Application not found or already processed"}), 404

    temp_password = _generate_password()
    password_hash = _hash_password(temp_password)

    user = User(
        email=application.email,
        intra_username=application.intra_username,
        name=application.name,
        password_hash=password_hash,
        role="member",
        is_active=True,
    )
    db.session.add(user)

    application.status = "approved"
    application.reviewed_by_id = request.current_user.id
    application.reviewed_at = utcnow()
    db.session.commit()

    _send_email(
        subject="Your 42 Berlin AI Club membership is approved",
        body=f"Hi {user.name},\n\nYour membership has been approved.\n\nLogin: https://42berlinaiclub.de/login.html\nUsername: {user.email or user.intra_username}\nTemporary password: {temp_password}\n\nPlease change your password after first login.",
        to=user.email,
    )

    return jsonify({"user": user.to_dict(), "temp_password": temp_password}), 200


@app.post("/admin/reject")
@_require_admin
def reject_application():
    data = request.get_json(silent=True) or {}
    app_id = data.get("application_id")
    application = Application.query.get(app_id)
    if not application or application.status != "pending":
        return jsonify({"error": "Application not found or already processed"}), 404

    application.status = "rejected"
    application.reviewed_by_id = request.current_user.id
    application.reviewed_at = utcnow()
    db.session.commit()

    return jsonify({"message": "Application rejected"}), 200


# ---------------------------------------------------------------------------
# Admin partner inquiries
# ---------------------------------------------------------------------------

@app.get("/admin/partner-inquiries")
@_require_admin
def list_partner_inquiries():
    inquiries = PartnerInquiry.query.order_by(PartnerInquiry.created_at.desc()).all()
    return jsonify([i.to_dict() for i in inquiries]), 200


@app.delete("/admin/partner-inquiries/<int:inquiry_id>")
@_require_admin
def delete_partner_inquiry(inquiry_id):
    inquiry = PartnerInquiry.query.get_or_404(inquiry_id)
    db.session.delete(inquiry)
    db.session.commit()
    return jsonify({"message": "Partner inquiry deleted"}), 200


# ---------------------------------------------------------------------------
# Admin member management
# ---------------------------------------------------------------------------

@app.get("/admin/members")
@_require_admin
def list_members():
    members = User.query.order_by(User.created_at.desc()).all()
    return jsonify([m.to_dict() for m in members]), 200


@app.post("/admin/promote")
@_require_superadmin
def promote_member():
    data = request.get_json(silent=True) or {}
    user_id = data.get("user_id")
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    if user.role == "superadmin":
        return jsonify({"error": "Cannot modify superadmin"}), 400

    user.role = "admin"
    db.session.commit()
    return jsonify({"user": user.to_dict()}), 200


@app.post("/admin/demote")
@_require_superadmin
def demote_member():
    data = request.get_json(silent=True) or {}
    user_id = data.get("user_id")
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    if user.role == "superadmin":
        return jsonify({"error": "Cannot modify superadmin"}), 400

    user.role = "member"
    db.session.commit()
    return jsonify({"user": user.to_dict()}), 200


@app.delete("/admin/members/<int:user_id>")
@_require_admin
def delete_member(user_id):
    user = User.query.get_or_404(user_id)
    if user.role == "superadmin":
        return jsonify({"error": "Cannot delete superadmin"}), 400
    if user.id == request.current_user.id:
        return jsonify({"error": "Cannot delete yourself"}), 400
    db.session.delete(user)
    db.session.commit()
    return jsonify({"message": "Member deleted"}), 200


# ---------------------------------------------------------------------------
# Admin blog / events / resources
# ---------------------------------------------------------------------------

@app.get("/admin/posts")
@_require_admin
def list_posts_admin():
    posts = BlogPost.query.order_by(BlogPost.created_at.desc()).all()
    return jsonify([p.to_dict() for p in posts]), 200


@app.post("/admin/posts")
@_require_admin
def create_post():
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    slug = (data.get("slug") or "").strip().lower()
    content = (data.get("content") or "").strip()
    summary = (data.get("summary") or "").strip()
    published = bool(data.get("published", True))

    if not title or not slug or not content:
        return jsonify({"error": "Title, slug, and content are required"}), 400
    if not re.match(r"^[a-z0-9-]+$", slug):
        return jsonify({"error": "Slug may only contain lowercase letters, numbers, and hyphens"}), 400

    if BlogPost.query.filter_by(slug=slug).first():
        return jsonify({"error": "A post with this slug already exists"}), 409

    post = BlogPost(
        title=title,
        slug=slug,
        content=content,
        summary=summary,
        published=published,
        author_id=request.current_user.id,
    )
    db.session.add(post)
    db.session.commit()
    return jsonify(post.to_dict()), 201


@app.put("/admin/posts/<int:post_id>")
@_require_admin
def update_post(post_id):
    post = BlogPost.query.get_or_404(post_id)
    data = request.get_json(silent=True) or {}
    post.title = (data.get("title") or post.title).strip()
    post.content = (data.get("content") or post.content).strip()
    post.summary = (data.get("summary") or post.summary).strip()
    if "published" in data:
        post.published = bool(data["published"])
    db.session.commit()
    return jsonify(post.to_dict()), 200


@app.delete("/admin/posts/<int:post_id>")
@_require_admin
def delete_post(post_id):
    post = BlogPost.query.get_or_404(post_id)
    db.session.delete(post)
    db.session.commit()
    return jsonify({"message": "Post deleted"}), 200


@app.post("/admin/events")
@_require_admin
def create_event():
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    slug = (data.get("slug") or "").strip().lower()
    description = (data.get("description") or "").strip()
    location = (data.get("location") or "").strip()
    link = (data.get("link") or "").strip()
    event_type = (data.get("event_type") or "workshop").strip().lower()
    is_public = bool(data.get("is_public", True))
    cover_image = (data.get("cover_image") or "").strip()
    event_date = data.get("event_date")

    if not title:
        return jsonify({"error": "Title is required"}), 400

    if not slug:
        slug = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')
    if not re.match(r"^[a-z0-9-]+$", slug):
        return jsonify({"error": "Slug may only contain lowercase letters, numbers, and hyphens"}), 400

    if Event.query.filter_by(slug=slug).first():
        return jsonify({"error": "An event with this slug already exists"}), 409

    event = Event(
        title=title,
        slug=slug,
        description=description,
        location=location,
        link=link,
        event_type=event_type,
        is_public=is_public,
        cover_image=cover_image,
    )
    if event_date:
        try:
            event.event_date = datetime.fromisoformat(event_date.replace("Z", "+00:00"))
        except ValueError:
            return jsonify({"error": "Invalid event date"}), 400

    db.session.add(event)
    db.session.commit()
    return jsonify(event.to_dict()), 201


@app.delete("/admin/events/<int:event_id>")
@_require_admin
def delete_event(event_id):
    event = Event.query.get_or_404(event_id)
    # Delete materials first (SQLite FK is disabled, no CASCADE)
    for material in event.materials:
        import os
        full_path = os.path.join("/app/data/materials", str(event_id), material.file_path)
        if os.path.exists(full_path):
            os.remove(full_path)
        db.session.delete(material)
    db.session.delete(event)
    db.session.commit()
    return jsonify({"message": "Event and all materials deleted"}), 200


@app.post("/admin/resources")
@_require_admin
def create_resource():
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    description = (data.get("description") or "").strip()
    url = (data.get("url") or "").strip()
    category = (data.get("category") or "").strip()

    if not title:
        return jsonify({"error": "Title is required"}), 400

    resource = Resource(title=title, description=description, url=url, category=category)
    db.session.add(resource)
    db.session.commit()
    return jsonify(resource.to_dict()), 201


@app.delete("/admin/resources/<int:resource_id>")
@_require_admin
def delete_resource(resource_id):
    resource = Resource.query.get_or_404(resource_id)
    db.session.delete(resource)
    db.session.commit()
    return jsonify({"message": "Resource deleted"}), 200


# ---------------------------------------------------------------------------
# Admin events (enhanced)
# ---------------------------------------------------------------------------

@app.get("/admin/events")
@_require_admin
def list_events_admin():
    events = Event.query.order_by(Event.event_date.desc()).all()
    return jsonify([e.to_dict() for e in events]), 200


@app.put("/admin/events/<int:event_id>")
@_require_admin
def update_event(event_id):
    event = Event.query.get_or_404(event_id)
    data = request.get_json(silent=True) or {}
    event.title = (data.get("title") or event.title).strip()
    event.description = (data.get("description") or event.description).strip()
    event.location = (data.get("location") or event.location).strip()
    event.link = (data.get("link") or event.link).strip()
    event.event_type = (data.get("event_type") or event.event_type).strip().lower()
    if "is_public" in data:
        event.is_public = bool(data["is_public"])
    event.cover_image = (data.get("cover_image") or event.cover_image).strip()
    event_date = data.get("event_date")
    if event_date:
        try:
            event.event_date = datetime.fromisoformat(event_date.replace("Z", "+00:00"))
        except ValueError:
            return jsonify({"error": "Invalid event date"}), 400
    db.session.commit()
    return jsonify(event.to_dict()), 200


# ---------------------------------------------------------------------------
# Admin event materials
# ---------------------------------------------------------------------------

ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "gif", "pdf", "webp", "svg"}
MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16 MB


def _allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


@app.get("/admin/events/<int:event_id>/materials")
@_require_admin
def list_event_materials_admin(event_id):
    event = Event.query.get_or_404(event_id)
    materials = EventMaterial.query.filter_by(event_id=event_id).order_by(EventMaterial.sort_order.asc()).all()
    return jsonify([m.to_dict() for m in materials]), 200


@app.post("/admin/events/<int:event_id>/materials")
@_require_admin
def upload_event_material(event_id):
    event = Event.query.get_or_404(event_id)

    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "Empty filename"}), 400

    title = (request.form.get("title") or file.filename).strip()
    description = (request.form.get("description") or "").strip()
    file_type = (request.form.get("file_type") or "").strip().lower()
    sort_order = int(request.form.get("sort_order") or 0)
    is_revealed = request.form.get("is_revealed", "false").lower() == "true"
    is_downloadable = request.form.get("is_downloadable", "true").lower() == "true"

    if not file_type:
        ext = file.filename.rsplit(".", 1)[1].lower() if "." in file.filename else ""
        if ext in {"jpg", "jpeg", "png", "gif", "webp", "svg"}:
            file_type = "slide" if ext in {"jpg", "jpeg", "png", "webp"} else "image"
        elif ext == "pdf":
            file_type = "pdf"
        else:
            file_type = "file"

    if not _allowed_file(file.filename):
        return jsonify({"error": f"File type not allowed. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"}), 400

    # Save file
    event_dir = os.path.join("/app/data/materials", str(event_id))
    os.makedirs(event_dir, exist_ok=True)

    ext = file.filename.rsplit(".", 1)[1].lower() if "." in file.filename else ""
    filename = f"{uuid.uuid4()}.{ext}"
    file_path = os.path.join(event_dir, filename)
    file.save(file_path)

    file_size = os.path.getsize(file_path)

    material = EventMaterial(
        event_id=event_id,
        title=title,
        description=description,
        file_path=filename,
        file_type=file_type,
        file_size=file_size,
        sort_order=sort_order,
        is_revealed=is_revealed,
        is_downloadable=is_downloadable,
    )
    db.session.add(material)
    db.session.commit()

    return jsonify(material.to_dict()), 201


@app.put("/admin/events/<int:event_id>/materials/<int:material_id>")
@_require_admin
def update_event_material(event_id, material_id):
    material = EventMaterial.query.filter_by(id=material_id, event_id=event_id).first_or_404()
    data = request.get_json(silent=True) or {}
    material.title = (data.get("title") or material.title).strip()
    material.description = (data.get("description") or material.description).strip()
    material.file_type = (data.get("file_type") or material.file_type).strip().lower()
    if "sort_order" in data:
        material.sort_order = int(data["sort_order"])
    if "is_revealed" in data:
        material.is_revealed = bool(data["is_revealed"])
    if "is_downloadable" in data:
        material.is_downloadable = bool(data["is_downloadable"])
    db.session.commit()
    return jsonify(material.to_dict()), 200


@app.post("/admin/events/<int:event_id>/materials/<int:material_id>/reveal")
@_require_admin
def toggle_material_reveal(event_id, material_id):
    material = EventMaterial.query.filter_by(id=material_id, event_id=event_id).first_or_404()
    material.is_revealed = not material.is_revealed
    db.session.commit()
    return jsonify({"message": f"Material is now {'revealed' if material.is_revealed else 'hidden'}", "is_revealed": material.is_revealed}), 200


@app.delete("/admin/events/<int:event_id>/materials/<int:material_id>")
@_require_admin
def delete_event_material(event_id, material_id):
    material = EventMaterial.query.filter_by(id=material_id, event_id=event_id).first_or_404()
    full_path = os.path.join("/app/data/materials", str(event_id), material.file_path)
    if os.path.exists(full_path):
        os.remove(full_path)
    db.session.delete(material)
    db.session.commit()
    return jsonify({"message": "Material deleted"}), 200


# ---------------------------------------------------------------------------
# Public event details and materials
# ---------------------------------------------------------------------------

@app.get("/events/<int:event_id>")
@limiter.exempt
def get_event(event_id):
    event = Event.query.get_or_404(event_id)
    if not event.is_public:
        return jsonify({"error": "This event is not public"}), 403
    data = event.to_dict()
    # Include only revealed materials
    materials = EventMaterial.query.filter_by(event_id=event_id, is_revealed=True).order_by(EventMaterial.sort_order.asc()).all()
    data["materials"] = [m.to_dict() for m in materials]
    return jsonify(data), 200


@app.get("/events/<int:event_id>/materials")
def list_event_materials(event_id):
    event = Event.query.get_or_404(event_id)
    if not event.is_public:
        return jsonify({"error": "This event is not public"}), 403
    materials = EventMaterial.query.filter_by(event_id=event_id, is_revealed=True).order_by(EventMaterial.sort_order.asc()).all()
    return jsonify([m.to_dict() for m in materials]), 200


@app.get("/events/<int:event_id>/materials/<int:material_id>/download")
@limiter.exempt
def download_event_material(event_id, material_id):
    event = Event.query.get_or_404(event_id)
    material = EventMaterial.query.filter_by(id=material_id, event_id=event_id).first_or_404()

    # Check auth for non-public events
    if not event.is_public:
        user = _current_user()
        if not user or not user.is_active:
            return jsonify({"error": "Authentication required"}), 401

    # Only revealed materials are downloadable by public
    if not material.is_revealed:
        user = _current_user()
        if not user or not user.is_active:
            return jsonify({"error": "This material is not yet available"}), 403

    if not material.is_downloadable:
        return jsonify({"error": "This material is not available for download"}), 403

    event_dir = os.path.join("/app/data/materials", str(event_id))
    from flask import send_from_directory
    # Images/slides: inline display (no attachment). PDFs: download (attachment).
    is_image = material.file_type in ('slide', 'image')
    return send_from_directory(event_dir, material.file_path, as_attachment=not is_image)


@app.get("/events/<int:event_id>/materials/<int:material_id>/view")
@limiter.exempt
def view_event_material(event_id, material_id):
    """Serve material inline for images - for <img> tags."""
    event = Event.query.get_or_404(event_id)
    material = EventMaterial.query.filter_by(id=material_id, event_id=event_id).first_or_404()

    if not event.is_public:
        return jsonify({"error": "This event is not public"}), 403
    if not material.is_revealed:
        return jsonify({"error": "This material is not yet available"}), 403

    event_dir = os.path.join("/app/data/materials", str(event_id))
    from flask import send_from_directory
    return send_from_directory(event_dir, material.file_path, as_attachment=False)


# ---------------------------------------------------------------------------
# Admin quiz questions
# ---------------------------------------------------------------------------

@app.get("/admin/events/<int:event_id>/quiz")
@_require_admin
def list_quiz_questions(event_id):
    Event.query.get_or_404(event_id)
    questions = QuizQuestion.query.filter_by(event_id=event_id).order_by(QuizQuestion.sort_order.asc()).all()
    return jsonify([q.to_dict(include_answer=True) for q in questions]), 200


@app.post("/admin/events/<int:event_id>/quiz")
@_require_admin
def create_quiz_question(event_id):
    Event.query.get_or_404(event_id)
    data = request.get_json(silent=True) or {}
    question = (data.get("question") or "").strip()
    hint = (data.get("hint") or "").strip()
    options = data.get("options") or []
    correct_answer = data.get("correct_answer")
    explanation = (data.get("explanation") or "").strip()
    sort_order = int(data.get("sort_order") or 0)

    if not question or not options or correct_answer is None:
        return jsonify({"error": "Question, options, and correct_answer are required"}), 400
    if not isinstance(options, list) or len(options) < 2:
        return jsonify({"error": "Options must be an array with at least 2 items"}), 400
    if not (0 <= int(correct_answer) < len(options)):
        return jsonify({"error": "correct_answer must be a valid index into options"}), 400

    qq = QuizQuestion(
        event_id=event_id,
        question=question,
        hint=hint,
        options_json=json.dumps(options),
        correct_answer=int(correct_answer),
        explanation=explanation,
        sort_order=sort_order,
    )
    db.session.add(qq)
    db.session.commit()
    return jsonify(qq.to_dict(include_answer=True)), 201


@app.put("/admin/events/<int:event_id>/quiz/<int:question_id>")
@_require_admin
def update_quiz_question(event_id, question_id):
    Event.query.get_or_404(event_id)
    qq = QuizQuestion.query.filter_by(id=question_id, event_id=event_id).first_or_404()
    data = request.get_json(silent=True) or {}
    qq.question = (data.get("question") or qq.question).strip()
    qq.hint = (data.get("hint") or qq.hint).strip()
    options = data.get("options")
    if options is not None:
        if not isinstance(options, list) or len(options) < 2:
            return jsonify({"error": "Options must be an array with at least 2 items"}), 400
        qq.options_json = json.dumps(options)
    if "correct_answer" in data:
        opts = json.loads(qq.options_json)
        if not (0 <= int(data["correct_answer"]) < len(opts)):
            return jsonify({"error": "correct_answer must be a valid index"}), 400
        qq.correct_answer = int(data["correct_answer"])
    qq.explanation = (data.get("explanation") or qq.explanation).strip()
    if "sort_order" in data:
        qq.sort_order = int(data["sort_order"])
    db.session.commit()
    return jsonify(qq.to_dict(include_answer=True)), 200


@app.delete("/admin/events/<int:event_id>/quiz/<int:question_id>")
@_require_admin
def delete_quiz_question(event_id, question_id):
    Event.query.get_or_404(event_id)
    qq = QuizQuestion.query.filter_by(id=question_id, event_id=event_id).first_or_404()
    db.session.delete(qq)
    db.session.commit()
    return jsonify({"message": "Question deleted"}), 200


# ---------------------------------------------------------------------------
# Public quiz (members-only)
# ---------------------------------------------------------------------------

@app.get("/events/<int:event_id>/quiz")
@_require_login
@limiter.exempt
def get_quiz(event_id):
    event = Event.query.get_or_404(event_id)
    questions = QuizQuestion.query.filter_by(event_id=event_id).order_by(QuizQuestion.sort_order.asc()).all()
    return jsonify({
        "event": event.to_dict(),
        "questions": [q.to_dict(include_answer=False) for q in questions],
        "total": len(questions),
    }), 200


@app.post("/events/<int:event_id>/quiz/submit")
@_require_login
@limiter.limit("60 per hour")
def submit_quiz(event_id):
    event = Event.query.get_or_404(event_id)
    data = request.get_json(silent=True) or {}
    answers = data.get("answers") or {}  # {question_id: selected_index}

    questions = QuizQuestion.query.filter_by(event_id=event_id).order_by(QuizQuestion.sort_order.asc()).all()
    if not questions:
        return jsonify({"error": "No quiz questions found for this event"}), 404

    correct_count = 0
    results = []
    for q in questions:
        selected = answers.get(str(q.id))
        is_correct = selected is not None and int(selected) == q.correct_answer
        if is_correct:
            correct_count += 1
        results.append({
            "question_id": q.id,
            "question": q.question,
            "selected": selected,
            "correct_answer": q.correct_answer,
            "is_correct": is_correct,
            "explanation": q.explanation,
        })

    score = round((correct_count / len(questions)) * 100) if questions else 0

    attempt = QuizAttempt(
        user_id=request.current_user.id,
        event_id=event_id,
        score=score,
        answers_json=json.dumps(answers),
    )
    db.session.add(attempt)
    db.session.commit()

    return jsonify({
        "score": score,
        "correct": correct_count,
        "total": len(questions),
        "results": results,
    }), 200


# ---------------------------------------------------------------------------
# Member auth
# ---------------------------------------------------------------------------

@app.post("/member/login")
@limiter.limit("60 per hour")
def member_login():
    data = request.get_json(silent=True) or {}
    login = (data.get("intra_username") or data.get("username") or data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    user = User.query.filter(
        (User.email == login) | (User.intra_username == login)
    ).first()

    if not user or not user.is_active or user.role not in ("member", "admin", "superadmin"):
        return jsonify({"error": "Invalid username or password"}), 401
    if not _check_password(password, user.password_hash):
        return jsonify({"error": "Invalid username or password"}), 401

    session.permanent = True
    session["user_id"] = user.id
    session["role"] = user.role
    return jsonify({"user": user.to_dict()}), 200


@app.post("/member/logout")
@_require_login
@limiter.exempt
def member_logout():
    session.clear()
    return jsonify({"message": "Logged out"}), 200


@app.get("/member/me")
@limiter.exempt
@_require_login
def member_me():
    return jsonify({"user": request.current_user.to_dict(include_email=False)}), 200


@app.post("/member/change-password")
@_require_login
def change_password():
    data = request.get_json(silent=True) or {}
    current = data.get("current_password") or ""
    new = data.get("new_password") or ""

    if len(new) < 8:
        return jsonify({"error": "New password must be at least 8 characters"}), 400
    if not _check_password(current, request.current_user.password_hash):
        return jsonify({"error": "Current password is incorrect"}), 401

    request.current_user.password_hash = _hash_password(new)
    db.session.commit()
    return jsonify({"message": "Password updated"}), 200


@app.post("/forgot-password")
@limiter.limit("3 per hour")
def forgot_password():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()

    if not email or not _is_valid_email(email):
        return jsonify({"error": "Please provide a valid email address."}), 400

    user = User.query.filter_by(email=email).first()
    # Always return same message to prevent email enumeration
    if not user:
        return jsonify({"message": "If this email is registered, a reset link has been sent."}), 200

    # Generate token and hash it for storage
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()

    user.password_reset_token = token_hash
    user.password_reset_expires_at = utcnow() + timedelta(hours=24)
    db.session.commit()

    reset_url = f"https://42berlinaiclub.de/reset-password.html?token={raw_token}"
    _send_email(
        subject="42 Berlin AI Club — Password Reset Request",
        body=f"Hi {user.name},\n\nYou requested a password reset.\n\nClick the link below to set a new password:\n{reset_url}\n\nThis link expires in 24 hours.\n\nIf you didn't request this, ignore this email.",
        to=user.email,
    )

    return jsonify({"message": "If this email is registered, a reset link has been sent."}), 200


@app.post("/reset-password")
@limiter.limit("5 per hour")
def reset_password():
    data = request.get_json(silent=True) or {}
    token = (data.get("token") or "").strip()
    new_password = data.get("new_password") or ""

    if not token or len(new_password) < 8:
        return jsonify({"error": "Invalid token or password too short (min 8 characters)."}), 400

    token_hash = hashlib.sha256(token.encode()).hexdigest()
    user = User.query.filter(
        User.password_reset_token == token_hash,
        User.password_reset_expires_at > utcnow(),
    ).first()

    if not user:
        return jsonify({"error": "Invalid or expired reset token."}), 400

    user.password_hash = _hash_password(new_password)
    user.password_reset_token = None
    user.password_reset_expires_at = None
    db.session.commit()

    return jsonify({"message": "Password reset successfully. You can now log in with your new password."}), 200


# ---------------------------------------------------------------------------
# Public / member content
# ---------------------------------------------------------------------------

@app.get("/posts")
def list_posts():
    posts = BlogPost.query.filter_by(published=True).order_by(BlogPost.created_at.desc()).all()
    return jsonify([p.to_dict() for p in posts]), 200


@app.get("/posts/<slug>")
def get_post(slug):
    post = BlogPost.query.filter_by(slug=slug, published=True).first_or_404()
    return jsonify(post.to_dict()), 200


@app.get("/events")
@limiter.exempt
def list_events():
    events = Event.query.order_by(Event.event_date.desc()).all()
    return jsonify([e.to_dict() for e in events]), 200


@app.get("/resources")
@limiter.exempt
def list_resources():
    resources = Resource.query.order_by(Resource.created_at.desc()).all()
    return jsonify([r.to_dict() for r in resources]), 200
