import "./SignUp.css"
import { useState } from "react";
import { Link } from "react-router-dom";
import Submitarrow from "../../assets/images/Submit-Arrow-removebg.png"
import openedeye from "../../assets/images/open_eye-removebg-preview.png"
import closededeye from "../../assets/images/closed_eye-removebg-preview.png"

function SignUp(){
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    return(
        <div className="MainContainer">
            <section className="BrandName">Ruderegez</section>

            <section className="Sign-in">
                <h2>Create account</h2>
                <h5>Join us to start shopping</h5>

                <button className="ContinueWithGoogle" type="button">
                    Continue With Google
                </button>

                <div className="Separator"></div>

                <form className="Credentials">
                    <div className="NameRow">
                        <input placeholder="First name" type="text" autoComplete="given-name" />
                        <input placeholder="Last name" type="text" autoComplete="family-name" />
                    </div>

                    <input placeholder="Email" type="email" autoComplete="email" />

                    <input placeholder="Phone number" type="tel" autoComplete="tel" />

                    <div className="InputWrapper">
                        <input
                            placeholder="Password"
                            type={showPassword ? "text" : "password"}
                            className="PasswordInput"
                            autoComplete="new-password"
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

                    <div className="InputWrapper">
                        <input
                            placeholder="Confirm password"
                            type={showConfirm ? "text" : "password"}
                            className="PasswordInput"
                            autoComplete="new-password"
                        />
                        <button
                            type="button"
                            className="EyeButton"
                            onClick={() => setShowConfirm(!showConfirm)}
                            aria-label={showConfirm ? "Hide password" : "Show password"}
                        >
                            <img src={showConfirm ? closededeye : openedeye} alt="" />
                        </button>
                    </div>

                    <p className="Hint">At least 8 characters</p>

                    <button className="PrimaryButton" type="submit">
                        Create account
                        <img src={Submitarrow} alt="" />
                    </button>

                    <Link to="/login" className="signuplink">
                        Already have an account? Sign in
                    </Link>
                </form>
            </section>

            <section className="Policy">
                <Link to="/policy">Policy</Link>
            </section>
        </div>
    )
}

export default SignUp