#!/usr/bin/env node
/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { createApp } from './server/dist/index.js';

async function testServer() {
  try {
    console.log('🔧 Testing backend server...\n');
    
    const app = await createApp();
    const PORT = 4001;
    
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log('✅ Backend server started successfully!');
      console.log(`   URL: http://localhost:${PORT}`);
      console.log(`   Health: http://localhost:${PORT}/health\n`);
      
      // Test health endpoint
      fetch(`http://localhost:${PORT}/health`)
        .then(res => res.json())
        .then(data => {
          console.log('✅ Health check passed:', data);
          console.log('\n✨ Backend server is working correctly!\n');
          server.close();
          process.exit(0);
        })
        .catch(err => {
          console.error('❌ Health check failed:', err.message);
          server.close();
          process.exit(1);
        });
    });
    
    server.on('error', (err) => {
      console.error('❌ Server error:', err.message);
      process.exit(1);
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

testServer();
