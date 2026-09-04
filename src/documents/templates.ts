export interface Template {
  id: string
  name: string
  source: string
}

export const TEMPLATES: Template[] = [
  {
    id: 'flowchart',
    name: 'Flowchart',
    source: `flowchart TD
    A[Start] --> B{Is it working?}
    B -- Yes --> C[Ship it]
    B -- No --> D[Debug]
    D --> B
    C --> E([Done])`,
  },
  {
    id: 'sequence',
    name: 'Sequence diagram',
    source: `sequenceDiagram
    autonumber
    participant U as User
    participant A as App
    participant S as Server
    U->>A: Click "Save"
    A->>S: PUT /documents/42
    activate S
    S-->>A: 200 OK
    deactivate S
    A-->>U: Show "Saved"`,
  },
  {
    id: 'class',
    name: 'Class diagram',
    source: `classDiagram
    class Document {
        +String id
        +String source
        +save()
    }
    class StorageProvider {
        <<interface>>
        +open()
        +save(doc)
    }
    class LocalProvider
    class DriveProvider
    StorageProvider <|.. LocalProvider
    StorageProvider <|.. DriveProvider
    Document --> StorageProvider : uses`,
  },
  {
    id: 'state',
    name: 'State diagram',
    source: `stateDiagram-v2
    [*] --> Idle
    Idle --> Editing : type
    Editing --> Rendering : debounce
    Rendering --> Idle : success
    Rendering --> Error : parse error
    Error --> Editing : fix
    Idle --> [*] : close`,
  },
  {
    id: 'er',
    name: 'Entity relationship',
    source: `erDiagram
    USER ||--o{ DOCUMENT : owns
    DOCUMENT ||--|{ REVISION : has
    DOCUMENT {
        string id PK
        string title
        datetime updatedAt
    }
    REVISION {
        string id PK
        string documentId FK
        text source
    }`,
  },
  {
    id: 'gantt',
    name: 'Gantt chart',
    source: `gantt
    title Release plan
    dateFormat  YYYY-MM-DD
    section Build
    Editor UI        :done,    ed, 2026-09-08, 2w
    URL sharing      :active,  ur, after ed, 1w
    AI assistant     :         ai, after ur, 2w
    section Storage
    Local files      :         fs, after ai, 1w
    Google Drive     :         gd, after fs, 2w`,
  },
  {
    id: 'pie',
    name: 'Pie chart',
    source: `pie showData
    title Where diagrams live
    "Google Drive" : 45
    "Local files" : 35
    "Shared links" : 20`,
  },
  {
    id: 'mindmap',
    name: 'Mind map',
    source: `mindmap
  root((Sirenes))
    Editor
      Live preview
      Syntax errors
    Storage
      Local files
      Google Drive
    Sharing
      URL fragment
    AI
      OpenRouter`,
  },
  {
    id: 'timeline',
    name: 'Timeline',
    source: `timeline
    title Project history
    2026-09 : PRD written
           : Editor shipped
    2026-10 : URL sharing
           : AI assistant
    2026-11 : Local files
           : Google Drive`,
  },
  {
    id: 'gitgraph',
    name: 'Git graph',
    source: `gitGraph
    commit id: "init"
    branch feature
    checkout feature
    commit id: "editor"
    commit id: "preview"
    checkout main
    merge feature
    commit id: "release" tag: "v0.1.0"`,
  },
]

export const DEFAULT_TEMPLATE = TEMPLATES[0].source
