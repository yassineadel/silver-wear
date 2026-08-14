import "./Login.css"
import { useState } from "react";
import { Link } from "react-router-dom";
import Submitarrow from "../../assets/images/Submit-Arrow-removebg.png"
import openedeye from "../../assets/images/open_eye-removebg-preview.png"
import closededeye from "../../assets/images/closed_eye-removebg-preview.png"

function Login(){
    const [showPassword, setShowPassword] = useState(false);

    return(
        <div className="MainContainer">
            <section className="BrandName">Ruderegez</section>

            <section className="Sign-in">
                <h2>Sign in</h2>
                <h5>Sign in or create an account</h5>
                <button className="ContinueWithGoogle" type="button">Continue With Google</button>
                
                <div className="Separator"></div>

                <section className="Credentials">
                    <input placeholder="Email" type="email" />

                    <div className="PasswordRow">
                        <div className="InputWrapper">
                            <input
                                placeholder="Password"
                                type={showPassword ? "text" : "password"}
                                className="PasswordInput"
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

                        <button className="SubmitButton" type="submit" aria-label="Sign in">
                            <img src={Submitarrow} alt="" />
                        </button>
                    </div>

                    <Link to="/Signup" className="signuplink">
                        If you don't have an account, Click here!
                    </Link>
                </section>
            </section>

            <section className="Policy"><a href="/policy">Policy</a></section>
        </div>
    )
}

export default Login;