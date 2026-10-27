import React, { useState, useEffect } from 'react';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../Firebase';
import '../styles/TwoFactorGate.scss'; 

export default function TwoFactorGate({ mode, existingSecret, uid, userCollection = 'users', userEmail, onSuccess, onCancel }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  
  // Setup Mode States
  const [setupSecret, setSetupSecret] = useState('');
  const [qrUrl, setQrUrl] = useState('');

  // Generate QR code and Secret only if they are in setup mode
  useEffect(() => {
    if (mode === 'setup') {
      const secret = new OTPAuth.Secret({ size: 20 }).base32;
      setSetupSecret(secret);

      const totp = new OTPAuth.TOTP({
        issuer: 'FacilityRes',
        label: userEmail || 'User',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: secret
      });

      QRCode.toDataURL(totp.toString())
        .then(url => setQrUrl(url))
        .catch(err => console.error('QR Code generation failed', err));
    }
  }, [mode, userEmail]);

  const handleVerify = async (e) => {
    e.preventDefault();
    setError('');
    setIsVerifying(true);

    const activeSecret = mode === 'setup' ? setupSecret : existingSecret;

    const totp = new OTPAuth.TOTP({
      issuer: 'FacilityRes',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: activeSecret
    });

    const delta = totp.validate({ token: code, window: 1 });

    if (delta !== null) {
      if (mode === 'setup') {
        try {
          // Save the newly generated secret to their database profile
          await updateDoc(doc(db, userCollection, uid), {
            twoFactorEnabled: true,
            twoFactorSecret: activeSecret
          });
          onSuccess(); 
        } catch (err) {
          setError('Failed to save 2FA settings to database.');
          setIsVerifying(false);
        }
      } else {
        onSuccess(); 
      }
    } else {
      setError('Invalid or expired code. Please try again.');
      setCode('');
      setIsVerifying(false);
    }
  };

  return (
    <div className="two-factor-container">
      <div className={`two-factor-card ${mode === 'setup' ? 'setup-mode' : ''}`}>
        <div className="icon-wrapper">
          <i className="ph-fill ph-shield-check"></i>
        </div>
        
        <h2>{mode === 'setup' ? 'Secure Your Account' : 'Two-Factor Authentication'}</h2>
        
        {mode === 'setup' ? (
          <>
            <p className="description">
              Scan this QR code with Microsoft Authenticator, or enter the setup key manually.
            </p>
            {qrUrl && (
              <div className="qr-code-wrapper">
                <img src={qrUrl} alt="2FA QR Code" />
              </div>
            )}
            <div className="manual-key-wrapper">
              <span className="manual-key-label">Setup Key</span>
              <div className="manual-key-action">
                <code>{setupSecret}</code>
                <button type="button" onClick={() => navigator.clipboard.writeText(setupSecret)} title="Copy to clipboard">
                  Copy
                </button>
              </div>
            </div>
          </>
        ) : (
          <p className="description">
            Open Google Authenticator and enter your 6-digit code to continue.
          </p>
        )}
        
        <form onSubmit={handleVerify}>
          <input
            type="text"
            className="code-input"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            autoFocus
          />
          {error && <div className="error-message">{error}</div>}
          
          <div className="button-group">
            <button type="button" className="btn-cancel" onClick={onCancel} disabled={isVerifying}>
              Cancel
            </button>
            <button type="submit" className="btn-verify" disabled={code.length !== 6 || isVerifying}>
              {isVerifying ? 'Verifying...' : (mode === 'setup' ? 'Verify & Enable' : 'Verify')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}