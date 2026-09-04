/** The diagram a first-time visitor sees. New files and new diagrams start empty. */
export const DEFAULT_TEMPLATE = `flowchart TD
    A[Start] --> B{Is it working?}
    B -- Yes --> C[Ship it]
    B -- No --> D[Debug]
    D --> B
    C --> E([Done])`
