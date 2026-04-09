/**
 * KeyFindings.tsx
 * Displays key findings from the analysis
 */

import React from 'react';

interface KeyFindingsProps {
  findings: string[];
}

export const KeyFindings: React.FC<KeyFindingsProps> = ({ findings }) => {
  return (
    <div className="key-findings">
      <h3>KEY FINDINGS</h3>
      {findings.length === 0 ? (
        <p className="no-findings">No findings detected.</p>
      ) : (
        <ol className="findings-list">
          {findings.map((finding, idx) => (
            <li key={idx} className="finding-item">
              {finding}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};
