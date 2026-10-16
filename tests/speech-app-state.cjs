function createAppState(initial = 'active') {
  const listeners = new Set();
  return {
    currentState: initial,
    addEventListener(_event, listener) {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
    emit(state) {
      this.currentState = state;
      [...listeners].forEach((listener) => listener(state));
    },
    get listenerCount() { return listeners.size; },
  };
}
module.exports = { createAppState };
