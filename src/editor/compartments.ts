import { Compartment } from '@codemirror/state'

/** Swappable editor parts: plain history vs. collaborative (Yjs) editing, and read-only mode. */
export const historyCompartment = new Compartment()
export const collabCompartment = new Compartment()
export const readOnlyCompartment = new Compartment()
