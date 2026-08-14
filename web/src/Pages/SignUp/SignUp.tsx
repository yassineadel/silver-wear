import "./SignUp.css";
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { register, verifyOtp, resendOtp } from "../../lib/auth";
import { ApiError } from "../../lib/api";
import openedeye from "../../assets/images/open_eye-removebg-preview.png";
import closededeye from "../../assets/images/closed_eye-removebg-preview.png";

function SignUp() {
  const [step, setStep] = useState<"form" | "otp">("form");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const navigate = useNavigate();

  function handleApiError(err: unknown) {
    if (err instanceof ApiError) {
      setError(err.message);
      if (err.fields) {
        setFieldErrors(
          Object.fromEntries(err.fields.map((f) => [f.path, f.message]))
        );
      }
    } else {
      setError("Network error");
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setFieldErrors({});

    try {
      await register({
        firstName,
        lastName,
        email,
        password,
        ...(phone ? { phone } : {}),
      });
      setStep("otp");
    } catch (err) {
      handleApiError(err);
    } finally {
      setPending(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);

    try {
      await verifyOtp(email, code);
      navigate("/", { replace: true });
    } catch (err) {
      handleApiError(err);
    } finally {
      setPending(false);
    }
  }

  async function handleResend() {
    setError(null);
    setNotice(null);
    try {
      await resendOtp(email);
      setNotice("A new code has been sent.");
    } catch (err) {
      handleApiError(err);
    }
  }

  return (
    <div className="MainContainer">
      <section className="BrandName">Ruderegez</section>

      <section className="Sign-in">
        {step === "form" ? (
          <>
            <h2>Create account</h2>
            <h5>Join us to start shopping</h5>

            <button className="ContinueWithGoogle" type="button">
              Continue With Google
            </button>

            <div className="Separator"></div>

            <form className="Credentials" onSubmit={handleRegister}>
              <div className="NameRow">
                <input
                  placeholder="First name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoComplete="given-name"
                  required
                />
                <input
                  placeholder="Last name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  autoComplete="family-name"
                  required
                />
              </div>

              <input
                placeholder="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
              {fieldErrors.email && (
                <p className="ErrorText">{fieldErrors.email}</p>
              )}

              <input
                placeholder="Phone (optional)"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
              />
              {fieldErrors.phone && (
                <p className="ErrorText">{fieldErrors.phone}</p>
              )}

              <div className="InputWrapper">
                <input
                  placeholder="Password"
                  type={showPassword ? "text" : "password"}
                  className="PasswordInput"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="EyeButton"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  <img src={showPassword ? closededeye : openedeye} alt="" />
                </button>
              </div>
              {fieldErrors.password && (
                <p className="ErrorText">{fieldErrors.password}</p>
              )}

              <p className="Hint">At least 8 characters</p>

              {error && <p className="ErrorText" role="alert">{error}</p>}

              <button className="PrimaryButton" type="submit" disabled={pending}>
                {pending ? "Sending code..." : "Create account"}
              </button>

              <Link to="/login" className="signuplink">
                Already have an account? Sign in
              </Link>
            </form>
          </>
        ) : (
          <>
            <h2>Check your email</h2>
            <h5>We sent a 6-digit code to {email}</h5>

            <div className="Separator"></div>

            <form className="Credentials" onSubmit={handleVerify}>
              <input
                placeholder="000000"
                className="OtpInput"
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
              />

              {error && <p className="ErrorText" role="alert">{error}</p>}
              {notice && <p className="Hint">{notice}</p>}

              <button
                className="PrimaryButton"
                type="submit"
                disabled={pending || code.length !== 6}
              >
                {pending ? "Verifying..." : "Verify"}
              </button>

              <button type="button" className="TextButton" onClick={handleResend}>
                Resend code
              </button>

              <button
                type="button"
                className="TextButton"
                onClick={() => {
                  setStep("form");
                  setError(null);
                  setCode("");
                }}
              >
                Use a different email
              </button>
            </form>
          </>
        )}
      </section>

      <section className="Policy">
        <Link to="/policy">Policy</Link>
      </section>
    </div>
  );
}

export default SignUp;