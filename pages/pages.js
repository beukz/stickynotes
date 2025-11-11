document.addEventListener('DOMContentLoaded', () => {
  const confettiTrigger = document.getElementById('confetti-trigger');

  function triggerConfetti() {
    // First confetti burst from the center
    confetti({
      particleCount: 200,
      spread: 100,
      origin: { y: 0.6 },
      colors: ['#FF5733', '#FFBD33', '#75FF33', '#33FFBD', '#3385FF', '#9D33FF', '#FF33A1'] // Fun, vibrant colors
    });

    // Secondary bursts from the sides
    setTimeout(() => {
      confetti({
        particleCount: 100,
        angle: 60,
        spread: 80,
        origin: { x: 0 },
        colors: ['#FF5733', '#75FF33', '#3385FF'] // Selected subset for variety
      });
      confetti({
        particleCount: 100,
        angle: 120,
        spread: 80,
        origin: { x: 1 },
        colors: ['#FFBD33', '#33FFBD', '#9D33FF'] // Another subset for balance
      });
    }, 500);
  }

  // Trigger confetti burst on page load
  setTimeout(triggerConfetti, 500);

  // Add click listener to the button
  if (confettiTrigger) {
    confettiTrigger.addEventListener('click', triggerConfetti);
  }
});