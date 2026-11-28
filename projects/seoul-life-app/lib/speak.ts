// Uses the phone's built-in Korean voice: free, and works offline on iOS.
export function speakKorean(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !text) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ko-KR";
  u.rate = 0.85;
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith("ko"));
  if (voice) u.voice = voice;
  window.speechSynthesis.speak(u);
}
