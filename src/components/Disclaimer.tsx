import React from 'react';

const Disclaimer: React.FC = () => {
  return (
    <div className="disclaimer-container">
      <p className="disclaimer-text">
        <strong>Disclaimer:</strong> The payments calculated by this tool are estimates only. Actual payments, interest rates, loan terms, and down payment requirements are subject to lender approval and depend on your creditworthiness, credit history, and other factors. This calculator is for informational purposes only and should not be considered financial advice. Please consult with your lender for accurate loan terms and payments.
      </p>
      <p className="disclaimer-text">
        <strong>What lenders usually ask for:</strong> a pay stub from the last 30 days (or a Notice of Assessment and bank statements if self-employed), a valid driver&rsquo;s licence, current proof of address, a void cheque and proof of insurance. Non-prime lenders typically want income of at least $1,750 to $3,000 a month, cap the payment at 17% to 20% of income, cap the loan at 125% to 150% of the vehicle&rsquo;s book value, limit Carfax damage to about $6,000 to $7,500, and will not finance branded, rebuilt or structurally damaged vehicles. Older vehicles (2018 and earlier) can carry a rate premium of about 2% at some banks.
      </p>
      <p className="disclaimer-text">
        Rates and terms last checked against lender rate sheets on November 15, 2026.
      </p>
    </div>
  );
};

export default Disclaimer;
