import "./Login.css";
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { login } from "../../lib/auth";
import { ApiError } from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";
import Submitarrow from "../../assets/images/Submit-Arrow-removebg.png";
import openedeye from "../../assets/images/open_eye-removebg-preview.png";
import closededeye from "../../assets/images/closed_eye-removebg-preview.png";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const navigate = useNavigate();
  const { setUser } = useAuth();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);

    try {
    const res = await login(email, password);
      setUser(res.user);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="MainContainer">
      <section className="BrandName">Ruderegez</section>

      <section className="Sign-in">
        <h2>Sign in</h2>
        <h5>Sign in or create an account</h5>
        <button className="ContinueWithGoogle" type="button">
          Continue With Google
        </button>

        <div className="Separator"></div>

        <form className="Credentials" onSubmit={handleSubmit}>
          <input
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />

          <div className="PasswordRow">
            <div className="InputWrapper">
              <input
                placeholder="Password"
                type={showPassword ? "text" : "password"}
                className="PasswordInput"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
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

            <button
              className="SubmitButton"
              type="submit"
              disabled={pending}
              aria-label="Sign in"
            >
              <img src={Submitarrow} alt="" />
            </button>
          </div>

          {error && <p className="ErrorText" role="alert">{error}</p>}

          <Link to="/signup" className="signuplink">
            If you don't have an account, Click here!
          </Link>
        </form>
      </section>

      <section className="Policy">
        <Link to="/policy">Policy</Link>
      </section>
    </div>
  );
}

export default Login;