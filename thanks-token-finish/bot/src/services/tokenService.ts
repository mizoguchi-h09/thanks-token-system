export function getTokenAmount(emoji: string): number {
  switch (emoji) {
    case "❤️":
      return 1;

    case "⭐":
      return 3;

    case "🏆":
      return 5;

    default:
      return 0;
  }
}