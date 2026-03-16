export function WelcomeScreen() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <div className="text-4xl">octos</div>
      <p className="max-w-md text-muted">
        AI agent powered by octos. Send a message to get started.
      </p>
    </div>
  );
}
