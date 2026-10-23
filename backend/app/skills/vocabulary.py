"""Curated skills vocabulary with aliases, shared by job analysis and matching.

Matching is exact on normalized tokens (case-insensitive, word boundaries), so "Go" never
matches "good" and "Java" never matches "JavaScript". The list is deliberately conservative:
an unknown skill is simply not recognized; nothing is guessed.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache

# canonical name -> (category, aliases)
_VOCAB: dict[str, tuple[str, tuple[str, ...]]] = {
    # languages
    "Python": ("language", ()),
    "Java": ("language", ("core java", "java 8", "java 11", "java 17")),
    "JavaScript": ("language", ("js",)),
    "TypeScript": ("language", ("ts",)),
    "Go": ("language", ("golang",)),
    "Rust": ("language", ()),
    "C": ("language", ()),
    "C++": ("language", ("cpp",)),
    "C#": ("language", ("c sharp",)),
    "Ruby": ("language", ()),
    "PHP": ("language", ()),
    "Kotlin": ("language", ()),
    "Swift": ("language", ()),
    "Scala": ("language", ()),
    "R": ("language", ()),
    "MATLAB": ("language", ()),
    "Perl": ("language", ()),
    "Dart": ("language", ()),
    "Elixir": ("language", ()),
    "Haskell": ("language", ()),
    "Lua": ("language", ()),
    "Objective-C": ("language", ()),
    "Bash": ("language", ("shell scripting", "shell")),
    "PowerShell": ("language", ()),
    "SQL": ("language", ()),
    "HTML": ("language", ("html5",)),
    "XML": ("language", ()),
    "XSLT": ("language", ()),
    "CSS": ("language", ("css3",)),
    "Solidity": ("language", ()),
    "Julia": ("language", ()),
    # frontend
    "React": ("framework", ("react.js", "reactjs")),
    "Angular": ("framework", ("angularjs",)),
    "Vue.js": ("framework", ("vue", "vuejs")),
    "Svelte": ("framework", ()),
    "Next.js": ("framework", ("nextjs",)),
    "Nuxt": ("framework", ("nuxt.js",)),
    "Redux": ("framework", ()),
    "Tailwind CSS": ("framework", ("tailwind",)),
    "Sass": ("framework", ("scss",)),
    "jQuery": ("framework", ()),
    "Webpack": ("tool", ()),
    "Vite": ("tool", ()),
    "React Native": ("framework", ()),
    "Flutter": ("framework", ()),
    # backend
    "Node.js": ("framework", ("node", "nodejs")),
    "Express": ("framework", ("express.js",)),
    "NestJS": ("framework", ()),
    "Django": ("framework", ()),
    "Flask": ("framework", ()),
    "FastAPI": ("framework", ()),
    "Spring": (
        "framework",
        (
            "spring boot",
            "springboot",
            "spring framework",
            "spring mvc",
            "spring cloud",
            "spring data",
        ),
    ),
    "J2EE": ("framework", ("java ee", "jakarta ee", "jee")),
    "Hibernate": ("framework", ()),
    "JPA": ("framework", ("java persistence api",)),
    "ORM": ("concept", ("orm tools", "object relational mapping", "object-relational mapping")),
    "Netflix OSS": ("tool", ()),
    "Ruby on Rails": ("framework", ("rails",)),
    "Laravel": ("framework", ()),
    ".NET": ("framework", ("dotnet", "asp.net", ".net core")),
    "GraphQL": ("framework", ()),
    "REST": ("concept", ("rest api", "rest apis", "restful", "restful apis")),
    "gRPC": ("framework", ()),
    "Microservices": ("concept", ("microservice", "micro services", "micro service")),
    "Multithreading": ("concept", ("multi-threading", "multi threading")),
    "Design Patterns": ("concept", ("design pattern",)),
    "Celery": ("tool", ()),
    "RabbitMQ": ("tool", ()),
    "Kafka": ("tool", ("apache kafka",)),
    # data stores
    "PostgreSQL": ("database", ("postgres", "psql")),
    "MySQL": ("database", ()),
    "SQLite": ("database", ()),
    "MongoDB": ("database", ("mongo",)),
    "Redis": ("database", ()),
    "Elasticsearch": ("database", ("elastic search", "opensearch")),
    "Cassandra": ("database", ()),
    "DynamoDB": ("database", ()),
    "Oracle": ("database", ()),
    "SQL Server": ("database", ("mssql", "ms sql")),
    "Snowflake": ("database", ()),
    "BigQuery": ("database", ()),
    "Redshift": ("database", ()),
    "Neo4j": ("database", ()),
    "Firebase": ("database", ()),
    "Supabase": ("database", ()),
    # generative AI
    "Generative AI": ("concept", ("genai", "gen ai", "gen-ai")),
    "RAG": ("concept", ("retrieval augmented generation", "retrieval-augmented generation")),
    "Prompt Engineering": ("concept", ()),
    "Embeddings": ("concept", ("embedding", "vector embeddings")),
    "Vector Databases": (
        "concept",
        ("vector database", "vector db", "vector search", "vector store"),
    ),
    "AI Agents": ("concept", ("ai agent", "agentic ai", "agentic")),
    "LangChain": ("framework", ()),
    "LangGraph": ("framework", ()),
    "LlamaIndex": ("framework", ("llama index",)),
    "Hugging Face": ("framework", ("huggingface",)),
    "OpenAI API": ("tool", ("openai",)),
    "Ollama": ("tool", ()),
    "FAISS": ("database", ()),
    "Pinecone": ("database", ()),
    "ChromaDB": ("database", ("chroma",)),
    "Weaviate": ("database", ()),
    # cloud & devops
    "AWS": ("cloud", ("amazon web services",)),
    "Azure": ("cloud", ("microsoft azure",)),
    "GCP": ("cloud", ("google cloud", "google cloud platform")),
    "Docker": ("tool", ()),
    "Kubernetes": ("tool", ("k8s",)),
    "Terraform": ("tool", ()),
    "Ansible": ("tool", ()),
    "Helm": ("tool", ()),
    "Jenkins": ("tool", ()),
    "GitHub Actions": ("tool", ()),
    "GitLab CI": ("tool", ("gitlab ci/cd",)),
    "CI/CD": ("concept", ("ci cd", "continuous integration")),
    "Linux": ("tool", ()),
    "Git": ("tool", ()),
    "Nginx": ("tool", ()),
    "Prometheus": ("tool", ()),
    "Grafana": ("tool", ()),
    "Datadog": ("tool", ()),
    "Lambda": ("cloud", ("aws lambda",)),
    "EC2": ("cloud", ()),
    "S3": ("cloud", ()),
    "CloudFormation": ("tool", ()),
    "Serverless": ("concept", ()),
    "DevOps": ("concept", ()),
    "SRE": ("concept", ("site reliability",)),
    "Observability": ("concept", ()),
    "Pulumi": ("tool", ()),
    "ArgoCD": ("tool", ("argo cd",)),
    # data / ML
    "Pandas": ("library", ()),
    "NumPy": ("library", ()),
    "scikit-learn": ("library", ("sklearn",)),
    "TensorFlow": ("library", ()),
    "PyTorch": ("library", ()),
    "Keras": ("library", ()),
    "Spark": ("tool", ("apache spark", "pyspark")),
    "Hadoop": ("tool", ()),
    "Airflow": ("tool", ("apache airflow",)),
    "dbt": ("tool", ()),
    "ETL": ("concept", ("elt",)),
    "Machine Learning": ("concept", ("ml",)),
    "Deep Learning": ("concept", ()),
    "NLP": ("concept", ("natural language processing",)),
    "Computer Vision": ("concept", ()),
    "LLMs": ("concept", ("llm", "large language model", "large language models")),
    "Data Analysis": ("concept", ()),
    "Data Engineering": ("concept", ()),
    "Statistics": ("concept", ()),
    "Tableau": ("tool", ()),
    "Power BI": ("tool", ("powerbi",)),
    "Looker": ("tool", ()),
    "Excel": ("tool", ("microsoft excel", "ms excel")),
    "Jupyter": ("tool", ()),
    "MLOps": ("concept", ()),
    "A/B Testing": ("concept", ("ab testing", "a/b tests")),
    # testing & quality
    "Unit Testing": ("concept", ("unit tests",)),
    "pytest": ("tool", ()),
    "Jest": ("tool", ()),
    "Cypress": ("tool", ()),
    "Playwright": ("tool", ()),
    "Selenium": ("tool", ()),
    "TDD": ("concept", ("test-driven development",)),
    "JUnit": ("tool", ()),
    # practices / architecture
    "System Design": ("concept", ("distributed systems",)),
    "Agile": ("concept", ()),
    "Scrum": ("concept", ()),
    "Kanban": ("concept", ()),
    "OOP": ("concept", ("object-oriented",)),
    "Data Structures": ("concept", ()),
    "Algorithms": ("concept", ()),
    "Security": ("concept", ("application security", "appsec")),
    "OAuth": ("concept", ("oauth2",)),
    "API Design": ("concept", ()),
    "Performance Optimization": ("concept", ()),
    "Accessibility": ("concept", ("a11y", "wcag")),
    "Responsive Design": ("concept", ()),
    "UX Design": ("concept", ("ux", "user experience")),
    "UI Design": ("concept", ()),
    "Figma": ("tool", ()),
    "Jira": ("tool", ()),
    "Confluence": ("tool", ()),
    # business & soft skills
    "Communication": ("soft", ("communication skills",)),
    "Leadership": ("soft", ()),
    "Mentoring": ("soft", ("mentorship",)),
    "Stakeholder Management": ("soft", ()),
    "Project Management": ("soft", ()),
    "Product Management": ("soft", ()),
    "Problem Solving": ("soft", ("problem-solving",)),
    "Collaboration": ("soft", ("teamwork",)),
    "SEO": ("concept", ()),
    "Salesforce": ("tool", ()),
    "SAP": ("tool", ()),
}


@dataclass(frozen=True)
class SkillDef:
    name: str
    category: str
    patterns: tuple[str, ...]


def _pattern(term: str) -> str:
    escaped = re.escape(term.lower())
    # Word-ish boundaries that also work for terms like "c++", ".net", "c#", "node.js".
    return rf"(?<![\w+#.]){escaped}(?![\w+#]|\.\w)"


@lru_cache
def skill_defs() -> tuple[SkillDef, ...]:
    return tuple(
        SkillDef(name, category, tuple(_pattern(t) for t in (name, *aliases)))
        for name, (category, aliases) in _VOCAB.items()
    )


@lru_cache
def _compiled() -> tuple[tuple[SkillDef, re.Pattern[str]], ...]:
    out = []
    for d in skill_defs():
        out.append((d, re.compile("|".join(d.patterns))))
    return tuple(out)


# Single letters are too ambiguous in free text ("C" grade, "R" in "R&D"); only accept them
# when they appear in an explicit skills list, never in prose.
_AMBIGUOUS_IN_PROSE = {
    "C",
    "R",
    "Go",
    "Swift",
    "Spring",
    "Express",
    "Lambda",
    "Excel",
    "S3",
    "REST",
    "Dart",
    "Rust",
    "Ruby",
    "Helm",
    "Looker",
    "Oracle",
}


def find_skills(text: str, *, prose: bool = True) -> list[str]:
    """Canonical skill names mentioned in `text`, in first-mention order."""
    lowered = text.lower()
    hits: list[tuple[int, str]] = []
    for definition, pattern in _compiled():
        match = pattern.search(lowered)
        if not match:
            continue
        matched_canonical = match.group(0) == definition.name.lower()
        ambiguous = prose and matched_canonical and definition.name in _AMBIGUOUS_IN_PROSE
        if ambiguous and not _cased_hit(text, definition):
            continue  # e.g. "go to market", "a rust-colored", "excel at"
        hits.append((match.start(), definition.name))
    hits.sort()
    seen: set[str] = set()
    ordered = []
    for _, name in hits:
        if name not in seen:
            seen.add(name)
            ordered.append(name)
    return ordered


def _cased_hit(text: str, definition: SkillDef) -> bool:
    if definition.name in {"C", "R"}:
        # Only "C" / "R" followed by a list separator or "programming"/"language".
        return bool(
            re.search(
                rf"(?<![\w+#]){definition.name}(?=\s*(?:,|/|\)|and\b|or\b|"
                r"programming|language))",
                text,
            )
        )
    return bool(re.search(rf"(?<![\w]){re.escape(definition.name)}(?![\w])", text))


def canonical(name: str) -> str | None:
    """Maps a free-form skill name (e.g. from a resume) to its canonical name, if known."""
    lowered = name.strip().lower()
    for definition, pattern in _compiled():
        if pattern.fullmatch(lowered):
            return definition.name
    return None


def category_of(name: str) -> str | None:
    entry = _VOCAB.get(name)
    return entry[0] if entry else None
