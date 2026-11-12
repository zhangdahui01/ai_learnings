// Sound on native builds is not implemented yet: the hall is silent there. The web build has it (sound.web.ts).
export interface Track { id: string; title: string; credit: string }
export const TRACKS: Track[] = [];
export const soundSupported = false;
export function unlockSound(): void {}
export function setChanting(_trackId: string | null): void {}
export function playKnock(): void {}
export function playBell(): void {}
export function soundStatus(): { state: string; position: number } { return { state: 'unsupported', position: 0 }; }
