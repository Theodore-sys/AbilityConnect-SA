import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

class Boundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return <pre style={{ padding: 20, whiteSpace: 'pre-wrap', color: '#b00020' }}>{String(this.state.error.stack || this.state.error)}</pre>;
    }
    return this.props.children;
  }
}

import('./App.jsx')
  .then(({ default: App }) => {
    createRoot(document.getElementById('root')).render(<Boundary><App /></Boundary>);
  })
  .catch((e) => {
    document.getElementById('root').innerHTML =
      '<pre style="padding:20px;white-space:pre-wrap;color:#b00020">' + String(e.stack || e) + '</pre>';
  });