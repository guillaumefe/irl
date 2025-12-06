"""
server.py – LifePath RPG API (version PostgreSQL)
---------------------------------------------------------
Backend FastAPI connecté à PostgreSQL via SQLAlchemy.

Fonctionnalités :
- Auth simple par token
- LifePaths communautaires
- Stores / items / marketplace / achats
- Fichiers chiffrés (stockés bruts, pas de déchiffrement serveur)
- Sync PWA (payload chiffré côté client)
- Chat proxy vers OpenAI (/api/chat)
- Level rewards

Dépendances (requirements.txt typique) :
    fastapi
    uvicorn[standard]
    SQLAlchemy>=2.0
    psycopg2-binary
    python-multipart
    passlib[bcrypt]
    openai

Lancement en dev (sans docker) :
    export DATABASE_URL="postgresql+psycopg2://lp_user:lp_pass@localhost:5432/lifepath"
    export OPENAI_API_KEY="..."
    uvicorn server:app --reload
---------------------------------------------------------
"""

import os
import uuid
import secrets
from datetime import datetime
from typing import List, Optional, Dict, Any

from fastapi import (
    FastAPI,
    HTTPException,
    UploadFile,
    File,
    Depends,
    Header,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, EmailStr

from passlib.context import CryptContext

from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    Text,
    ForeignKey,
    JSON,
    Float,
    UniqueConstraint,
)
from sqlalchemy.orm import (
    declarative_base,
    relationship,
    sessionmaker,
    Session,
)

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None

# ---------------------------------------------------------
# CONFIG GLOBALE
# ---------------------------------------------------------

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://lp_user:lp_pass@db:5432/lifepath",
)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
API_DEBUG = bool(os.getenv("LIFEPATH_DEBUG", "0") == "1")

UPLOAD_DIR = os.path.abspath("./uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

app = FastAPI(title="LifePath RPG API (PostgreSQL)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # à restreindre en prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------
# SQLALCHEMY SETUP
# ---------------------------------------------------------

engine = create_engine(DATABASE_URL, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
Base = declarative_base()


def now_utc() -> datetime:
    return datetime.utcnow()


def now_iso() -> str:
    return now_utc().isoformat(timespec="seconds") + "Z"


def make_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------
# SQLALCHEMY MODELS
# ---------------------------------------------------------

class UserModel(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    display_name = Column(String, nullable=True)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=now_utc)

    tokens = relationship("TokenModel", back_populates="user")


class TokenModel(Base):
    __tablename__ = "tokens"

    token = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=now_utc)

    user = relationship("UserModel", back_populates="tokens")


class LifePathModel(Base):
    __tablename__ = "lifepaths"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    domain = Column(String, nullable=True)
    domain_icon = Column(String, nullable=True)
    base_icon = Column(String, nullable=True)
    difficulty = Column(Integer, default=2)
    language = Column(String, default="fr")
    tags = Column(JSON, default=list)
    author_id = Column(String, ForeignKey("users.id"), nullable=True)
    author_name = Column(String, nullable=True)
    visibility = Column(String, default="public")
    created_at = Column(DateTime, default=now_utc)
    updated_at = Column(DateTime, default=now_utc)
    stages = Column(JSON, default=list)


class StoreModel(Base):
    __tablename__ = "stores"

    id = Column(String, primary_key=True)
    owner_id = Column(String, ForeignKey("users.id"), nullable=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=now_utc)
    updated_at = Column(DateTime, default=now_utc)


class ItemModel(Base):
    __tablename__ = "items"

    id = Column(String, primary_key=True)
    store_id = Column(String, ForeignKey("stores.id"), nullable=False, index=True)
    owner_id = Column(String, ForeignKey("users.id"), nullable=True)
    name = Column(String, nullable=False)
    type = Column(String, default="outfit")  # outfit / accessory / encrypted-file
    price = Column(Integer, default=0)
    emoji = Column(String, default="🎁")
    notify_email = Column(String, nullable=True)
    file_id = Column(String, ForeignKey("files.id"), nullable=True)
    created_at = Column(DateTime, default=now_utc)

    store = relationship("StoreModel")
    file = relationship("FileModel", back_populates="item", uselist=False)


class FileModel(Base):
    __tablename__ = "files"

    id = Column(String, primary_key=True)
    path = Column(String, nullable=False)
    created_at = Column(DateTime, default=now_utc)

    item = relationship("ItemModel", back_populates="file", uselist=False)


class PurchaseModel(Base):
    __tablename__ = "purchases"

    id = Column(String, primary_key=True)
    item_id = Column(String, ForeignKey("items.id"), nullable=False)
    player_id = Column(String, nullable=False)
    price = Column(Integer, default=0)
    created_at = Column(DateTime, default=now_utc)


class SyncStateModel(Base):
    __tablename__ = "sync_states"

    id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String, unique=True, index=True)  # userId ou "anonymous"
    data = Column(JSON, nullable=True)
    version = Column(Integer, default=1)
    updated_at = Column(DateTime, default=now_utc)


class LevelRewardModel(Base):
    __tablename__ = "level_rewards"

    level = Column(Integer, primary_key=True)
    currency = Column(Integer, default=0)
    items = Column(JSON, default=list)


# ---------------------------------------------------------
# DB INIT (tables + data de base)
# ---------------------------------------------------------

def init_db():
    Base.metadata.create_all(bind=engine)

    # Seed de base pour level_rewards si vide
    with SessionLocal() as db:
        existing = db.query(LevelRewardModel).first()
        if not existing:
            defaults = {
                2: {"currency": 100, "items": []},
                3: {"currency": 150, "items": []},
                4: {"currency": 200, "items": []},
                5: {"currency": 250, "items": []},
            }
            for lvl, cfg in defaults.items():
                db.add(
                    LevelRewardModel(
                        level=lvl,
                        currency=cfg["currency"],
                        items=cfg["items"],
                    )
                )
            db.commit()


init_db()

# ---------------------------------------------------------
# AUTH – Pydantic modèles & helpers
# ---------------------------------------------------------

class User(BaseModel):
    id: str
    email: EmailStr
    displayName: Optional[str]
    createdAt: str

class AuthSignupBody(BaseModel):
    email: EmailStr
    password: str
    displayName: Optional[str] = None

class AuthLoginBody(BaseModel):
    email: EmailStr
    password: str

class AuthResponse(BaseModel):
    token: str
    user: User


def hash_password(pw: str) -> str:
    return pwd_context.hash(pw)


def verify_password(pw: str, pw_hash: str) -> bool:
    return pwd_context.verify(pw, pw_hash)


def create_token_for_user(db: Session, user_id: str) -> str:
    token = secrets.token_hex(32)
    db_token = TokenModel(token=token, user_id=user_id)
    db.add(db_token)
    db.commit()
    return token


def get_user_by_email(db: Session, email: str) -> Optional[UserModel]:
    return (
        db.query(UserModel)
        .filter(UserModel.email == email.lower())
        .one_or_none()
    )


async def get_current_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> Optional[UserModel]:
    if not authorization:
        return None
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1]
    token_row = db.query(TokenModel).filter(TokenModel.token == token).one_or_none()
    if not token_row:
        return None
    user = db.query(UserModel).filter(UserModel.id == token_row.user_id).one_or_none()
    return user


# ---------------------------------------------------------
# AUTH – Routes
# ---------------------------------------------------------

@app.post("/api/auth/signup", response_model=AuthResponse)
async def signup(body: AuthSignupBody, db: Session = Depends(get_db)):
    existing = get_user_by_email(db, body.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email déjà utilisé")

    user_id = make_id("usr")
    user = UserModel(
        id=user_id,
        email=body.email.lower(),
        display_name=body.displayName or f"Joueur {user_id[:6]}",
        password_hash=hash_password(body.password),
        created_at=now_utc(),
    )
    db.add(user)
    db.commit()

    token = create_token_for_user(db, user_id)
    return AuthResponse(
        token=token,
        user=User(
            id=user.id,
            email=user.email,
            displayName=user.display_name,
            createdAt=user.created_at.isoformat(),
        ),
    )


@app.post("/api/auth/login", response_model=AuthResponse)
async def login(body: AuthLoginBody, db: Session = Depends(get_db)):
    user = get_user_by_email(db, body.email)
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Identifiants invalides")

    token = create_token_for_user(db, user.id)
    return AuthResponse(
        token=token,
        user=User(
            id=user.id,
            email=user.email,
            displayName=user.display_name,
            createdAt=user.created_at.isoformat(),
        ),
    )


@app.post("/api/auth/logout")
async def logout(current_user: UserModel = Depends(get_current_user)):
    # La gestion fine des tokens (invalidation) est facultative ici.
    return {"ok": True}


@app.get("/api/auth/me")
async def me(current_user: UserModel = Depends(get_current_user)):
    if not current_user:
        raise HTTPException(status_code=401, detail="Non authentifié")
    return {
        "user": {
            "id": current_user.id,
            "email": current_user.email,
            "displayName": current_user.display_name,
            "createdAt": current_user.created_at.isoformat(),
        }
    }


# ---------------------------------------------------------
# LIFEPATHS – Communauté
# ---------------------------------------------------------

@app.get("/api/lifepaths/search")
async def search_lifepaths(
    q: Optional[str] = None,
    lang: Optional[str] = "fr",
    db: Session = Depends(get_db),
):
    q_lower = (q or "").lower()
    query = db.query(LifePathModel)
    if lang:
        query = query.filter(LifePathModel.language == lang)

    results = []
    for lp in query.all():
        if not q_lower:
            results.append(lp)
            continue
        hay = (
            (lp.name or "")
            + " "
            + (lp.description or "")
            + " "
            + " ".join(lp.tags or [])
        ).lower()
        if q_lower in hay:
            results.append(lp)

    return [serialize_lifepath(lp) for lp in results]


def serialize_lifepath(lp: LifePathModel) -> Dict[str, Any]:
    return {
        "id": lp.id,
        "name": lp.name,
        "description": lp.description,
        "domain": lp.domain,
        "domainIcon": lp.domain_icon,
        "baseIcon": lp.base_icon,
        "difficulty": lp.difficulty,
        "language": lp.language,
        "tags": lp.tags,
        "authorId": lp.author_id,
        "authorName": lp.author_name,
        "visibility": lp.visibility,
        "createdAt": lp.created_at.isoformat(),
        "updatedAt": lp.updated_at.isoformat(),
        "stages": lp.stages or [],
    }


@app.post("/api/lifepaths")
async def create_lifepath(
    data: Dict[str, Any],
    current_user: Optional[UserModel] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    lp_id = data.get("id") or make_id("lp")
    now = now_utc()
    lp = LifePathModel(
        id=lp_id,
        name=data.get("name", "LifePath sans nom"),
        description=data.get("description"),
        domain=data.get("domain", "Divers"),
        domain_icon=data.get("domainIcon", "📁"),
        base_icon=data.get("baseIcon", "🧭"),
        difficulty=int(data.get("difficulty", 2)),
        language=data.get("language", "fr"),
        tags=data.get("tags") or [],
        author_id=current_user.id if current_user else data.get("authorId"),
        author_name=(
            current_user.display_name
            if current_user
            else data.get("authorName") or "Anonyme"
        ),
        visibility=data.get("visibility", "public"),
        created_at=now,
        updated_at=now,
        stages=data.get("stages") or [],
    )
    db.merge(lp)
    db.commit()
    return serialize_lifepath(lp)


# ---------------------------------------------------------
# STORES & ITEMS
# ---------------------------------------------------------

@app.post("/api/stores")
async def create_or_update_store(
    payload: Dict[str, Any],
    current_user: Optional[UserModel] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    owner_id = payload.get("ownerId")
    if current_user and not owner_id:
        owner_id = current_user.id
    if not owner_id:
        owner_id = payload.get("ownerId") or make_id("anon")

    name = payload.get("name") or f"Store de {owner_id[:6]}"
    description = payload.get("description") or "Store LifePath"

    store = (
        db.query(StoreModel)
        .filter(StoreModel.owner_id == owner_id)
        .one_or_none()
    )

    now = now_utc()
    if store:
        store.name = name
        store.description = description
        store.updated_at = now
    else:
        store = StoreModel(
            id=make_id("store"),
            owner_id=owner_id,
            name=name,
            description=description,
            created_at=now,
            updated_at=now,
        )
        db.add(store)
    db.commit()
    db.refresh(store)
    return {
        "id": store.id,
        "ownerId": store.owner_id,
        "name": store.name,
        "description": store.description,
        "createdAt": store.created_at.isoformat(),
        "updatedAt": store.updated_at.isoformat(),
    }


@app.get("/api/stores/me")
async def get_my_store(
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Non authentifié")
    store = (
        db.query(StoreModel)
        .filter(StoreModel.owner_id == current_user.id)
        .one_or_none()
    )
    if not store:
        raise HTTPException(status_code=404, detail="Aucun store pour cet utilisateur")
    return {
        "id": store.id,
        "ownerId": store.owner_id,
        "name": store.name,
        "description": store.description,
        "createdAt": store.created_at.isoformat(),
        "updatedAt": store.updated_at.isoformat(),
    }


@app.get("/api/stores/{store_id}")
async def get_store_by_id(store_id: str, db: Session = Depends(get_db)):
    store = db.query(StoreModel).filter(StoreModel.id == store_id).one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Store introuvable")
    return {
        "id": store.id,
        "ownerId": store.owner_id,
        "name": store.name,
        "description": store.description,
        "createdAt": store.created_at.isoformat(),
        "updatedAt": store.updated_at.isoformat(),
    }


@app.post("/api/items")
async def create_item(
    payload: Dict[str, Any],
    current_user: Optional[UserModel] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    store_id = payload.get("storeId")
    if not store_id:
        raise HTTPException(status_code=400, detail="storeId requis")

    item = ItemModel(
        id=make_id("item"),
        store_id=store_id,
        owner_id=current_user.id if current_user else payload.get("ownerId"),
        name=payload.get("name", "Item"),
        type=payload.get("type", "outfit"),
        price=int(payload.get("price", 0)),
        emoji=payload.get("emoji", "🎁"),
        notify_email=payload.get("notifyEmail"),
        file_id=payload.get("fileId"),
        created_at=now_utc(),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return serialize_item(item)


def serialize_item(item: ItemModel) -> Dict[str, Any]:
    return {
        "id": item.id,
        "storeId": item.store_id,
        "ownerId": item.owner_id,
        "name": item.name,
        "type": item.type,
        "price": item.price,
        "emoji": item.emoji,
        "notifyEmail": item.notify_email,
        "fileId": item.file_id,
        "createdAt": item.created_at.isoformat(),
    }


@app.get("/api/items")
async def list_items(
    storeId: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(ItemModel)
    if storeId:
        query = query.filter(ItemModel.store_id == storeId)
    return [serialize_item(i) for i in query.all()]


@app.get("/api/market/items")
async def market_search_items(
    q: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(ItemModel)
    items = query.all()
    if q:
        low = q.lower()
        items = [
            i
            for i in items
            if low in (i.name or "").lower()
            or low in (i.type or "").lower()
        ]
    return [serialize_item(i) for i in items]


@app.post("/api/purchase")
async def purchase(body: Dict[str, Any], db: Session = Depends(get_db)):
    item_id = body.get("itemId")
    player_id = body.get("playerId")
    price = int(body.get("price", 0))

    if not item_id or not player_id:
        raise HTTPException(status_code=400, detail="itemId et playerId requis")

    item = db.query(ItemModel).filter(ItemModel.id == item_id).one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item introuvable")

    purchase = PurchaseModel(
        id=make_id("purchase"),
        item_id=item_id,
        player_id=player_id,
        price=price,
        created_at=now_utc(),
    )
    db.add(purchase)
    db.commit()
    return {
        "ok": True,
        "purchase": {
            "id": purchase.id,
            "itemId": purchase.item_id,
            "playerId": purchase.player_id,
            "price": purchase.price,
            "createdAt": purchase.created_at.isoformat(),
        },
    }


# ---------------------------------------------------------
# FICHIERS CHIFFRÉS
# ---------------------------------------------------------

@app.post("/api/files/upload")
async def upload_encrypted_file(file: UploadFile = File(...), db: Session = Depends(get_db)):
    ext = os.path.splitext(file.filename)[1] or ".bin"
    file_id = make_id("file")
    dest = os.path.join(UPLOAD_DIR, file_id + ext)

    with open(dest, "wb") as f:
        f.write(await file.read())

    fm = FileModel(id=file_id, path=dest, created_at=now_utc())
    db.add(fm)
    db.commit()

    return {"fileId": file_id}


@app.get("/api/files/{file_id}")
async def download_encrypted_file(file_id: str, db: Session = Depends(get_db)):
    fm = db.query(FileModel).filter(FileModel.id == file_id).one_or_none()
    if not fm or not os.path.exists(fm.path):
        raise HTTPException(status_code=404, detail="Fichier introuvable")
    return FileResponse(fm.path, filename=os.path.basename(fm.path))


# ---------------------------------------------------------
# SYNC PWA (payload chiffré côté client)
# ---------------------------------------------------------

@app.post("/api/sync")
async def sync_state(
    payload: Dict[str, Any],
    current_user: Optional[UserModel] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    local_version = int(payload.get("localVersion", 1))
    encrypted = bool(payload.get("encrypted", False))
    data = payload.get("data")

    key = current_user.id if current_user else "anonymous"

    state = (
        db.query(SyncStateModel)
        .filter(SyncStateModel.key == key)
        .one_or_none()
    )
    if not state:
        state = SyncStateModel(
            key=key,
            data=data,
            version=local_version,
            updated_at=now_utc(),
        )
        db.add(state)
    else:
        # politique simple : dernière version écrase
        state.data = data
        state.version = max(state.version, local_version)
        state.updated_at = now_utc()

    db.commit()
    db.refresh(state)

    return {
        "encrypted": encrypted,
        "data": state.data,
        "remoteVersion": state.version,
    }


# ---------------------------------------------------------
# CHAT IA – Proxy OpenAI
# ---------------------------------------------------------

class ChatMessage(BaseModel):
    role: str
    content: str


class ChatBody(BaseModel):
    provider: Optional[str] = "openai"
    model: str = "gpt-4o-mini"
    messages: List[ChatMessage]


@app.post("/api/chat")
async def chat(body: ChatBody):
    if body.provider != "openai":
        raise HTTPException(status_code=400, detail="Seul provider=openai est supporté.")

    if not OPENAI_API_KEY or OpenAI is None:
        if API_DEBUG:
            return {
                "choices": [
                    {
                        "message": {
                            "role": "assistant",
                            "content": (
                                "⚠️ OPENAI_API_KEY non configurée côté serveur ou librairie manquante.\n"
                                "Réponse factice pour le développement."
                            ),
                        }
                    }
                ]
            }
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY manquant ou openai non installé.")

    client = OpenAI(api_key=OPENAI_API_KEY)
    messages = [{"role": m.role, "content": m.content} for m in body.messages]

    try:
        resp = client.chat.completions.create(
            model=body.model,
            messages=messages,
        )
        return resp.to_dict()
    except Exception as e:
        if API_DEBUG:
            raise HTTPException(status_code=500, detail=str(e))
        raise HTTPException(status_code=500, detail="Erreur lors de l'appel OpenAI")


# ---------------------------------------------------------
# LEVEL REWARDS
# ---------------------------------------------------------

@app.get("/api/level-rewards")
async def get_level_rewards(
    from_: Optional[int] = None,
    to: Optional[int] = None,
    db: Session = Depends(get_db),
):
    query = db.query(LevelRewardModel)

    if from_ is None and to is None:
        levels = query.all()
    else:
        if from_ is None:
            from_ = 1
        if to is None:
            to = from_
        levels = (
            query.filter(LevelRewardModel.level >= from_)
            .filter(LevelRewardModel.level <= to)
            .all()
        )

    result = {"levels": {}}
    for lr in levels:
        result["levels"][str(lr.level)] = {
            "currency": lr.currency,
            "items": lr.items or [],
        }
    return result


# ---------------------------------------------------------
# ROOT / HEALTHCHECK
# ---------------------------------------------------------

@app.get("/")
async def root():
    return {
        "ok": True,
        "service": "LifePath RPG API (PostgreSQL)",
        "time": now_iso(),
    }
