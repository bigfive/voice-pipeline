/**
 * UI Components
 * Reusable UI elements for the voice assistant
 */

/** Microphone icon SVG */
export const MIC_ICON = `
  <svg class="mic-icon" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
  </svg>
`;

/** Create message element */
export function createMessageElement(
  role: 'user' | 'assistant' | 'system',
  text: string
): HTMLElement {
  const msg = document.createElement('div');
  msg.className = `message ${role}`;
  msg.innerHTML = `<p>${escapeHtml(text)}</p>`;
  return msg;
}

/** Update message element text */
export function updateMessageText(element: HTMLElement, text: string): void {
  element.innerHTML = `<p>${escapeHtml(text)}</p>`;
}

/** Escape HTML entities */
export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/** Scroll element to bottom */
export function scrollToBottom(element: HTMLElement): void {
  element.scrollTop = element.scrollHeight;
}

