const { startServer } = require('../../backend/src/server');

describe('Application Startup Lifecycle', () => {
  let serverInstance;

  afterEach(async () => {
    if (serverInstance && serverInstance.close) {
      await new Promise((resolve) => serverInstance.close(resolve));
    }
  });

  test('startServer should initialize Express HTTP listener', async () => {
    const testPort = 3199;
    serverInstance = await startServer(testPort);
    expect(serverInstance).toBeDefined();
    expect(serverInstance.listening).toBe(true);
    expect(serverInstance.address().port).toBe(testPort);
  });
});
