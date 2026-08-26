// Feedback tab — a write-only note to the developer. The message lands
// in the `feedback` table (supabase/feedback_schema.sql), which has no
// select policy at all, so nothing here ever reads it back.
import { useSupabase, supabaseClient } from "./state.js";
import { $ } from "./dom-utils.js";
import { currentUserId, currentUserLabel } from "./persistence.js";

let wired = false;

// Called every time the Feedback tab is opened (setView(), nav.js) — puts
// the form back into its blank starting state, since a successful send
// hides it in favor of the thank-you message.
export function renderFeedbackView() {
  $("#feedbackForm").hidden = false;
  $("#feedbackThanks").hidden = true;
  $("#feedbackText").value = "";
  if (wired) return;
  wired = true;
  $("#feedbackSubmitBtn").addEventListener("click", submitFeedback);
}

async function submitFeedback() {
  const message = $("#feedbackText").value.trim();
  if (!message) {
    alert("Write something first.");
    return;
  }
  if (!useSupabase) {
    alert("Feedback needs an internet connection to send.");
    return;
  }

  try {
    const { error } = await supabaseClient.from("feedback").insert({
      user_id: currentUserId(),
      sender_name: currentUserLabel(),
      message,
    });
    if (error) throw error;
  } catch (e) {
    console.error("Feedback submit error", e);
    alert("Could not send your feedback — try again in a moment.");
    return;
  }

  $("#feedbackForm").hidden = true;
  const thanks = $("#feedbackThanks");
  thanks.textContent = `Thanks for your message, ${currentUserLabel()}!`;
  thanks.hidden = false;
}
