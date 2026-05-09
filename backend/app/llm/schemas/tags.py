from pydantic import BaseModel, ConfigDict, Field

TAGS_VERSION = "v1"


class TagSuggestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tags: list[str] = Field(
        description="1-5 tags from the taxonomy. Use exact lower-cased taxonomy names."
    )
