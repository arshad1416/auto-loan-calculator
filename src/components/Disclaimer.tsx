import React from 'react';

const Disclaimer: React.FC = () => {
  return (
    <div className="disclaimer-container">
      <p className="disclaimer-text">
        <strong>Disclaimer:</strong> The payments calculated by this tool are estimates only. Actual payments, interest rates, loan terms, and down payment requirements are subject to lender approval and depend on your creditworthiness, credit history, and other factors. This calculator is for informational purposes only and should not be considered financial advice. Please consult with your lender for accurate loan terms and payments.
      </p>
    </div>
  );
};

export default Disclaimer;
