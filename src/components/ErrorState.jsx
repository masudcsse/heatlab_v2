function ErrorState({ message }) {
  return (
    <div className="state-card error-card">
      <h3>Something went wrong</h3>
      <p>{message}</p>
    </div>
  );
}

export default ErrorState;
