"""Model profile management service."""

from dursor_api.domain.enums import Provider
from dursor_api.domain.models import ModelProfile, ModelProfileCreate
from dursor_api.services.crypto_service import CryptoService
from dursor_api.storage.dao import ModelProfileDAO


class ModelService:
    """Service for managing model profiles."""

    def __init__(self, dao: ModelProfileDAO, crypto: CryptoService):
        self.dao = dao
        self.crypto = crypto

    async def create(self, data: ModelProfileCreate) -> ModelProfile:
        """Create a new model profile.

        Args:
            data: Model profile creation data.

        Returns:
            Created model profile.
        """
        # Encrypt the API key
        encrypted_key = self.crypto.encrypt(data.api_key)

        return await self.dao.create(
            provider=data.provider,
            model_name=data.model_name,
            api_key_encrypted=encrypted_key,
            display_name=data.display_name,
        )

    async def get(self, model_id: str) -> ModelProfile | None:
        """Get a model profile by ID.

        Args:
            model_id: Model profile ID.

        Returns:
            Model profile or None if not found.
        """
        return await self.dao.get(model_id)

    async def list(self) -> list[ModelProfile]:
        """List all model profiles.

        Returns:
            List of model profiles.
        """
        return await self.dao.list()

    async def delete(self, model_id: str) -> bool:
        """Delete a model profile.

        Args:
            model_id: Model profile ID.

        Returns:
            True if deleted, False if not found.
        """
        return await self.dao.delete(model_id)

    async def get_decrypted_key(self, model_id: str) -> str | None:
        """Get the decrypted API key for a model profile.

        Args:
            model_id: Model profile ID.

        Returns:
            Decrypted API key or None if not found.
        """
        encrypted = await self.dao.get_encrypted_key(model_id)
        if not encrypted:
            return None
        return self.crypto.decrypt(encrypted)
