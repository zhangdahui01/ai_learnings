// Sound on native builds is not implemented yet: the hall is silent there. The web build has it (sound.web.ts).
export const soundSupported = false;
export function unlockSound(): void {}
export function setChanting(_on: boolean): void {}
export function playKnock(): void {}
export function playBell(): void {}
