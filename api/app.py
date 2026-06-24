"""42 Berlin AI Club API."""
import re
import secrets
import smtplib
from datetime import datetime, timezone
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
    PartnerInquiry,
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


def _send_email(subject: str, body: str, to: str) -> bool:
    cfg = Config()
    if not cfg.SMTP_HOST or not cfg.SMTP_USER or not cfg.SMTP_PASSWORD:
        app.logger.info("SMTP not configured; skipping email to %s", to)
        return False
    try:
        msg = MIMEText(body, "plain", "utf-8")
        msg["Subject"] = subject
        msg["From"] = cfg.SMTP_USER
        msg["To"] = to

        with smtplib.SMTP(cfg.SMTP_HOST, cfg.SMTP_PORT, timeout=10) as server:
            server.starttls()
            server.login(cfg.SMTP_USER, cfg.SMTP_PASSWORD)
            server.sendmail(cfg.SMTP_USER, [to], msg.as_string())
        return True
    except Exception as e:
        app.logger.exception("Failed to send email: %s", e)
        return False


def _origin_ok() -> bool:
    """Basic CSRF check: ensure request comes from the same origin."""
    origin = request.headers.get("Origin") or request.headers.get("Referer") or ""
    return origin.startswith("https://mysophia.tech") or origin.startswith("http://localhost")


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
        if not user or not user.is_active or user.role not in ("admin", "superadmin"):
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
        "events": Event.query.count(),
        "projects": Resource.query.count(),
        "workshops": BlogPost.query.count(),
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
        body=f"Name: {name}\nIntra: {intra}\nEmail: {email}\nLevel: {level}\nMessage:\n{message}\n\nReview at https://mysophia.tech/ai-club/admin.html",
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
@limiter.limit("5 per 15 minutes")
def admin_login():
    data = request.get_json(silent=True) or {}
    login = (data.get("email") or data.get("username") or "").strip().lower()
    password = data.get("password") or ""

    if not login or not password:
        return jsonify({"error": "Username/email and password are required."}), 400

    user = User.query.filter(
        (User.email == login) | (User.intra_username == login)
    ).first()
    if not user or not user.is_active or user.role not in ("admin", "superadmin"):
        return jsonify({"error": "Invalid email or password"}), 401
    if not _check_password(password, user.password_hash):
        return jsonify({"error": "Invalid email or password"}), 401

    session.clear()
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
    return jsonify({"user": request.current_user.to_dict()}), 200


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
        body=f"Hi {user.name},\n\nYour membership has been approved.\n\nLogin: https://mysophia.tech/ai-club/login.html\nUsername: {user.email or user.intra_username}\nTemporary password: {temp_password}\n\nPlease change your password after first login.",
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
    description = (data.get("description") or "").strip()
    location = (data.get("location") or "").strip()
    link = (data.get("link") or "").strip()
    event_date = data.get("event_date")

    if not title:
        return jsonify({"error": "Title is required"}), 400

    event = Event(title=title, description=description, location=location, link=link)
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
    db.session.delete(event)
    db.session.commit()
    return jsonify({"message": "Event deleted"}), 200


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
# Member auth
# ---------------------------------------------------------------------------

@app.post("/member/login")
@limiter.limit("5 per 15 minutes")
def member_login():
    data = request.get_json(silent=True) or {}
    login = (data.get("intra_username") or data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    user = User.query.filter(
        (User.email == login) | (User.intra_username == login)
    ).first()

    if not user or not user.is_active or user.role not in ("member", "admin", "superadmin"):
        return jsonify({"error": "Invalid username or password"}), 401
    if not _check_password(password, user.password_hash):
        return jsonify({"error": "Invalid username or password"}), 401

    session.clear()
    session.permanent = True
    session["user_id"] = user.id
    session["role"] = user.role
    return jsonify({"user": user.to_dict()}), 200


@app.post("/member/logout")
@_require_login
def member_logout():
    session.clear()
    return jsonify({"message": "Logged out"}), 200


@app.get("/member/me")
@_require_login
def member_me():
    return jsonify({"user": request.current_user.to_dict()}), 200


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
def list_events():
    events = Event.query.order_by(Event.event_date.desc()).all()
    return jsonify([e.to_dict() for e in events]), 200


@app.get("/resources")
def list_resources():
    resources = Resource.query.order_by(Resource.created_at.desc()).all()
    return jsonify([r.to_dict() for r in resources]), 200
