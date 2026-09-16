from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.models import Sala
from app.schemas.auth import RoomEnterRequest, TokenResponse
from app.services.auth import verify_password, get_password_hash, create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/room", response_model=TokenResponse)
def enter_or_create_room(req: RoomEnterRequest, db: Session = Depends(get_db)):
    # Check if room exists
    room = db.query(Sala).filter(Sala.nome_url == req.nome_url).first()
    
    if room:
        # Verify password
        if not verify_password(req.senha, room.hash_senha):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Senha incorreta para esta sala."
            )
    else:
        # Create room automatically if it doesn't exist (Zero-Login)
        hashed = get_password_hash(req.senha)
        room = Sala(nome_url=req.nome_url, hash_senha=hashed)
        db.add(room)
        db.commit()
        db.refresh(room)

    # Generate JWT token
    token_data = {
        "sala_id": str(room.id),
        "nome_url": room.nome_url,
        "nickname": req.nickname,
    }
    access_token = create_access_token(token_data)

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        sala_id=str(room.id),
        nickname=req.nickname,
        nome_url=room.nome_url
    )
