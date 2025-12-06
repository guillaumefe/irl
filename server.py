"""
server.py
---------------------------------------------------------
Backend API pour LifePath RPG.

Stack :
- FastAPI
- Stockage en mémoire (dicts Python) pour le dev
- Auth simple par token en mémoire
- Proxy /api/chat vers OpenAI (OPENAI_API_KEY)
- Sync PWA end-to-end chiffrée (le serveur ne voit que du JSON opaque)

Dépendances :

    pip install fastapi uvicorn openai python-multipart

Lancement en dev :

    uvicorn server:app --reload

Par défaut, l'API écoute sur http://localhost:8000
Tu peux alors configurer ton front pour pointer vers cette origine
(ou servir le front via un reverse proxy).
---------------------------------------------------------
"""

import os
import uuid
import secrets
from datetime import datetime
from typing import List, Optional, Dict, Any

from fastapi import FastAPI, HTTPException, Body, UploadFile, File, Form, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, EmailStr

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None  # on gérera le cas où la lib n'est pas installée

# ---------------------------------------------------------
# CONFIG GLOBALE
# ---------------------------------------------------------

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
API_DEBUG = bool(os.getenv("LIFEPATH_DEBUG", "1") == "1")

app = FastAPI(title="LifePath RPG API")

# CORS large pour le dev (front séparé ou localhost)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # à restreindre en prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------
# "BASE DE DONNÉES" EN MÉMOIRE (DEV)
# ---------------------------------------------------------

DB: Dict[str, Any] = {
    "users": {},            # user_id -> dict
    "tokens": {},           # token -> user_id
    "lifepaths": {},        # lifepath_id -> dict
    "stores": {},           # store_id -> dict
    "items": {},            # item_id -> dict
    "files": {},            # file_id -> filepath
    "purchases": [],        # liste de dict
    "sync_states": {},      # key -> {data, version}
    "level_rewards": {},    # int(level) -> dict
}

# Niveau 2-5 de base (exemple)
DB["level_rewards"] = {
    2: {"currency": 100, "items": []},
    3: {"currency": 150, "items": []},
    4: {"currency": 200, "items": []},
    5: {"currency": 250, "items": []},
}

UPLOAD_DIR = os.path.abspath("./uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ---------------------------------------------------------
# UTILITAIRES GÉNÉRIQUES
# ---------------------------------------------------------

def now_iso() -> str:
  return datetime.utcnow().isoformat(timespec="seconds") + "Z"

def make_id(prefix: str) -> str:
  return f"{prefix}_{uuid.uuid4().hex[:12]}"

# ---------------------------------------------------------
# AUTH – Modèles & helpers
# ---------------------------------------------------------

class User(BaseModel):
    id: str
    email: EmailStr
    displayName: Optional[str] = None
    password_hash: str  # pour le dev: hash "pauvre", à ne pas copier en prod
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
    user: Dict[str, Any]

def _hash_password(pw: str) -> str:
    # ATTENTION : pour le dev uniquement.
    # En prod, utiliser bcrypt / argon2.
    import hashlib
    return hashlib.sha256(pw.encode("utf-8")).hexdigest()

def _verify_password(pw: str, pw_hash: str) -> bool:
    return _hash_password(pw) == pw_hash

def _create_token_for_user(user_id: str) -> str:
    token = secrets.token_hex(32)
    DB["tokens"][token] = user_id
    return token

def _get_user_by_email(email: str) -> Optional[User]:
    for u in DB["users"].values():
        if u["email"].lower() == email.lower():
            return User(**u)
    return None

async def get_current_user(authorization: Optional[str] = Header(None)) -> Optional[User]:
    if not authorization:
        return None
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1]
    user_id = DB["tokens"].get(token)
    if not user_id:
        return None
    data = DB["users"].get(user_id)
    if not data:
        return None
    return User(**data)

# ---------------------------------------------------------
# AUTH – Routes
# ---------------------------------------------------------

@app.post("/api/auth/signup", response_model=AuthResponse)
async def signup(body: AuthSignupBody):
    existing = _get_user_by_email(body.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email déjà utilisé")

    user_id = make_id("usr")
    user = User(
        id=user_id,
        email=body.email,
        displayName=body.displayName or f"Joueur {user_id[:6]}",
        password_hash=_hash_password(body.password),
        createdAt=now_iso(),
    )
    DB["users"][user_id] = user.dict()
    token = _create_token_for_user(user_id)

    return AuthResponse(
        token=token,
        user={
            "id": user.id,
            "email": user.email,
            "displayName": user.displayName,
            "createdAt": user.createdAt,
        },
    )

@app.post("/api/auth/login", response_model=AuthResponse)
async def login(body: AuthLoginBody):
    user = _get_user_by_email(body.email)
    if not user or not _verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Identifiants invalides")

    token = _create_token_for_user(user.id)
    return AuthResponse(
        token=token,
        user={
            "id": user.id,
            "email": user.email,
            "displayName": user.displayName,
            "createdAt": user.createdAt,
        },
    )

@app.post("/api/auth/logout")
async def logout(current_user: User = Depends(get_current_user)):
    # En mémoire : on ne sait pas quel token spécifique invalider,
    # on laisse le front simplement oublier le token.
    return {"ok": True}

@app.get("/api/auth/me")
async def me(current_user: User = Depends(get_current_user)):
    if not current_user:
        raise HTTPException(status_code=401, detail="Non authentifié")
    return {"user": {
        "id": current_user.id,
        "email": current_user.email,
        "displayName": current_user.displayName,
        "createdAt": current_user.createdAt,
    }}

# ---------------------------------------------------------
# LIFEPATHS – communautaires
# ---------------------------------------------------------

@app.get("/api/lifepaths/search")
async def search_lifepaths(q: Optional[str] = None, lang: Optional[str] = "fr"):
    q_lower = (q or "").lower()
    result = []
    for lp in DB["lifepaths"].values():
        if lang and lp.get("language") and lp["language"] != lang:
            continue
        if not q_lower:
            result.append(lp)
        else:
            hay = (
                (lp.get("name") or "") + " " +
                (lp.get("description") or "") + " " +
                " ".join(lp.get("tags") or [])
            ).lower()
            if q_lower in hay:
                result.append(lp)
    return result

@app.post("/api/lifepaths")
async def create_lifepath(data: Dict[str, Any], current_user: Optional[User] = Depends(get_current_user)):
    # Le front envoie déjà un objet complet; on l'accepte quasiment tel quel.
    lp_id = data.get("id") or make_id("lp")
    now = now_iso()
    data["id"] = lp_id
    data.setdefault("createdAt", now)
    data["updatedAt"] = now
    if current_user:
        data["authorId"] = current_user.id
        data["authorName"] = current_user.displayName or f"Joueur {current_user.id[:6]}"
    DB["lifepaths"][lp_id] = data
    return data

# ---------------------------------------------------------
# STORES & ITEMS
# ---------------------------------------------------------

@app.post("/api/stores")
async def create_or_update_store(payload: Dict[str, Any], current_user: Optional[User] = Depends(get_current_user)):
    """
    Création ou mise à jour d'un store.
    En dev, on fait simple : un store par user.
    """
    owner_id = payload.get("ownerId")
    if current_user and not owner_id:
        owner_id = current_user.id

    if not owner_id:
        # Mode anonyme : on accepte quand même
        owner_id = payload.get("ownerId") or make_id("anon")

    # Cherche un store existant pour cet owner
    existing = None
    for st in DB["stores"].values():
        if st.get("ownerId") == owner_id:
            existing = st
            break

    name = payload.get("name") or f"Store de {owner_id[:6]}"
    description = payload.get("description") or "Store LifePath"

    if existing:
        existing["name"] = name
        existing["description"] = description
        existing["updatedAt"] = now_iso()
        store = existing
    else:
        store_id = make_id("store")
        store = {
            "id": store_id,
            "ownerId": owner_id,
            "name": name,
            "description": description,
            "createdAt": now_iso(),
            "updatedAt": now_iso(),
        }
        DB["stores"][store_id] = store

    return store

@app.get("/api/stores/me")
async def get_my_store(current_user: User = Depends(get_current_user)):
    if not current_user:
        raise HTTPException(status_code=401, detail="Non authentifié")
    for st in DB["stores"].values():
        if st.get("ownerId") == current_user.id:
            return st
    raise HTTPException(status_code=404, detail="Aucun store pour cet utilisateur")

@app.get("/api/stores/{store_id}")
async def get_store_by_id(store_id: str):
    store = DB["stores"].get(store_id)
    if not store:
        raise HTTPException(status_code=404, detail="Store introuvable")
    return store

@app.post("/api/items")
async def create_item(payload: Dict[str, Any], current_user: Optional[User] = Depends(get_current_user)):
    """
    Crée un item pour un store donné.
    Payload attendu : { name, type, price, emoji, ownerId, storeId, ... }
    """
    item_id = make_id("item")
    store_id = payload.get("storeId")
    if not store_id:
        raise HTTPException(status_code=400, detail="storeId requis")

    item = {
        "id": item_id,
        "storeId": store_id,
        "ownerId": payload.get("ownerId"),
        "name": payload.get("name", "Item"),
        "type": payload.get("type", "outfit"),
        "price": int(payload.get("price", 0)),
        "emoji": payload.get("emoji", "🎁"),
        "notifyEmail": payload.get("notifyEmail"),
        "fileId": payload.get("fileId"),
        "createdAt": now_iso(),
    }

    DB["items"][item_id] = item
    return item

@app.get("/api/items")
async def list_items(storeId: Optional[str] = None):
    """
    Liste :
      - tous les items si storeId est absent
      - les items d'un store si storeId est fourni
    """
    items = list(DB["items"].values())
    if storeId:
        items = [i for i in items if i.get("storeId") == storeId]
    return items

@app.get("/api/market/items")
async def market_search_items(q: Optional[str] = None):
    """
    Marketplace : recherche sur tous les items.
    """
    items = list(DB["items"].values())
    if q:
        low = q.lower()
        items = [
            i for i in items
            if low in (i.get("name") or "").lower()
            or low in (i.get("type") or "").lower()
        ]
    return items

@app.post("/api/purchase")
async def purchase(body: Dict[str, Any]):
    """
    Achat d'item.
    Pour l'instant : on enregistre juste la transaction.
    Côté front tu mets à jour les coins et l'inventaire.
    """
    item_id = body.get("itemId")
    player_id = body.get("playerId")
    price = body.get("price")

    if not item_id or not player_id:
        raise HTTPException(status_code=400, detail="itemId et playerId requis")

    item = DB["items"].get(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item introuvable")

    purchase = {
        "id": make_id("purchase"),
        "itemId": item_id,
        "playerId": player_id,
        "price": price,
        "createdAt": now_iso(),
    }
    DB["purchases"].append(purchase)

    # En vrai, ici tu enverrais un email au vendeur avec le mdp de déchiffrement
    # en utilisant item["notifyEmail"], etc.

    return {"ok": True, "purchase": purchase}

# ---------------------------------------------------------
# FICHIERS CHIFFRÉS
# ---------------------------------------------------------

@app.post("/api/files/upload")
async def upload_encrypted_file(file: UploadFile = File(...)):
    """
    Upload d'un fichier CHIFFRÉ côté client.
    Le serveur ne fait que le stocker tel quel.
    """
    ext = os.path.splitext(file.filename)[1] or ".bin"
    file_id = make_id("file")
    dest = os.path.join(UPLOAD_DIR, file_id + ext)

    with open(dest, "wb") as f:
        f.write(await file.read())

    DB["files"][file_id] = dest

    return {"fileId": file_id}

@app.get("/api/files/{file_id}")
async def download_encrypted_file(file_id: str):
    """
    Download d'un fichier chiffré tel quel (aucun déchiffrement côté serveur).
    """
    path = DB["files"].get(file_id)
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Fichier introuvable")
    return FileResponse(path, filename=os.path.basename(path))

# ---------------------------------------------------------
# SYNC PWA (end-to-end chiffrée)
# ---------------------------------------------------------

@app.post("/api/sync")
async def sync_state(payload: Dict[str, Any]):
    """
    Sync ultra-simple :
    - le client envoie { localVersion, encrypted, data }
    - le serveur stocke data comme "state" pour ce "canal"
    - renvoie { encrypted, data, remoteVersion }

    Comme la crypto est faite côté client (AES-GCM), "data" peut être du ciphertext.
    Le serveur reste agnostique.
    """
    local_version = int(payload.get("localVersion", 1))
    encrypted = bool(payload.get("encrypted", False))
    data = payload.get("data")

    # Ici on utilise une unique clé "global" (anon). En prod, utiliser userId.
    key = "anonymous"

    existing = DB["sync_states"].get(key)
    if not existing:
        remote_version = local_version
        DB["sync_states"][key] = {
            "version": remote_version,
            "data": data,
        }
    else:
        # Choix simple : on remplace par la dernière version
        remote_version = max(existing["version"], local_version)
        DB["sync_states"][key] = {
            "version": remote_version,
            "data": data,
        }

    return {
        "encrypted": encrypted,
        "data": DB["sync_states"][key]["data"],
        "remoteVersion": DB["sync_states"][key]["version"],
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
    """
    Proxy simple vers OpenAI Chat Completions.
    Nécessite OPENAI_API_KEY en variable d'environnement.
    """
    if body.provider != "openai":
        raise HTTPException(status_code=400, detail="Seul provider=openai est supporté pour le moment.")

    if not OPENAI_API_KEY or OpenAI is None:
        # Mode dev sans OpenAI installé / configuré
        if API_DEBUG:
            # On renvoie une réponse factice pour le dev offline
            return {
                "choices": [
                    {
                        "message": {
                            "role": "assistant",
                            "content": (
                                "⚠️ L'API OpenAI n'est pas configurée côté serveur.\n"
                                "Réponse factice pour le développement.\n\n"
                                "Tu peux me connecter à OpenAI en définissant OPENAI_API_KEY "
                                "et en installant la librairie 'openai'."
                            ),
                        }
                    }
                ]
            }
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY manquant ou librairie openai non installée.")

    client = OpenAI(api_key=OPENAI_API_KEY)

    # Transformation en format pour OpenAI
    messages = [{"role": m.role, "content": m.content} for m in body.messages]

    try:
        resp = client.chat.completions.create(
            model=body.model,
            messages=messages,
        )
        # On retourne la dict native sérialisable
        return resp.to_dict()
    except Exception as e:
        if API_DEBUG:
            raise HTTPException(status_code=500, detail=str(e))
        raise HTTPException(status_code=500, detail="Erreur lors de l'appel OpenAI")

# ---------------------------------------------------------
# LEVEL REWARDS
# ---------------------------------------------------------

@app.get("/api/level-rewards")
async def get_level_rewards(from_: Optional[int] = None, to: Optional[int] = None):
    """
    Retourne les récompenses par niveau entre from_ et to.
    Ex : /api/level-rewards?from=2&to=5
    """
    if from_ is None and to is None:
        return {"levels": DB["level_rewards"]}

    if from_ is None:
        from_ = 1
    if to is None:
        to = max(DB["level_rewards"].keys()) if DB["level_rewards"] else from_

    levels = {}
    for lvl in range(from_, to + 1):
        if lvl in DB["level_rewards"]:
            levels[str(lvl)] = DB["level_rewards"][lvl]
    return {"levels": levels}

# ---------------------------------------------------------
# RACINE / HEALTHCHECK
# ---------------------------------------------------------

@app.get("/")
async def root():
    return {
        "ok": True,
        "service": "LifePath RPG API",
        "time": now_iso(),
    }
