require("dotenv").config();
const express = require("express");
const session = require("express-session");
const axios = require("axios");
const mongoose = require("mongoose");
const User = require("./userModel");
const Weather = require("./weatherModel");
const ExchangeRate = require('./ExchangeRateModel');




const app = express();
const PORT = process.env.PORT || 3000;

mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connection established"))
  .catch((err) => console.error("MongoDB connection error:", err));

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  })
);

app.set("view engine", "ejs");

app.get("/", (req, res) => {
  res.render("index", {
    weather: null,
    error: null,
    user: req.session.username || null,
    isAdmin: req.session.isAdmin || false, 
  });
});


  app.post("/", async (req, res) => {
    if (!req.session.userId) {
      return res.redirect(
        "/login?message=Please log in or sign up to view weather history"
      );
    }
  
    const city = req.body.city;
    const apiKey = process.env.OPENWEATHER_API_KEY;
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&units=metric&appid=${apiKey}`;
    const apigKey = process.env.WEATHERBIT_AIR_QUALITY_API_KEY;
    const sunUrl = `https://api.weatherbit.io/v2.0/current?city=${city}&key=${apigKey}&include=minutely`;
    try {
      const response = await axios.get(url);
      const weatherData = response.data;
      const weatherDescription = weatherData.weather[0].description;
      const iconCode = weatherData.weather[0].icon;
      const iconUrl = `http://openweathermap.org/img/w/${iconCode}.png`;
     

      const respons = await axios.get(sunUrl);
      const weatherDat = respons.data.data[0];

      const newWeather = new Weather({
        city: city,
        temperature: weatherData.main.temp,
        description:weatherDescription,
        icon: iconUrl,
        userId: req.session.userId,
        sunrise: weatherDat.sunrise,
        sunset: weatherDat.sunset,
        lon:weatherData.coord.lon,
        lat:weatherData.coord.lat,
      });
  
      await newWeather.save();
  
      res.render("index", {
        weather: newWeather,
        error: null,
        user: req.session.username,
        isAdmin: req.session.isAdmin
      });
    } catch (error) {
      console.error("Error fetching weather data:", error);
      res.render("index", {
        weather: null,
        error: "Failed to fetch data. Please try again.",
        user: req.session.username,
        isAdmin: req.session.isAdmin
      });
    }
  });


app.get("/login", (req, res) => {
  res.render("login", {
    query: req.query,
    error: null,
    user: req.session ? req.session.user : null,
    isAdmin: req.session.isAdmin
  });
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  
  const user = await User.findOne({ username });

  if (user && password === user.password) {
    req.session.userId = user._id;
    req.session.username = user.username;

    
    req.session.isAdmin = user.isAdmin || false;

    if (req.session.isAdmin) {
      return res.redirect("/admin");
    } else {
      return res.redirect("/");
    }
  } else {
    res.render('login', {
      query: req.query, 
      error: "Invalid username or password",
      user: req.session.user || null, 
      isAdmin: req.session.isAdmin
    });
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

app.get("/weather-history", async (req, res) => {
  if (!req.session.userId) {
    return res.redirect("/login");
  }

  try {
    const weatherHistory = await Weather.find({ userId: req.session.userId }).sort('-date');;
    res.render("weather-history", {
      weatherData: weatherHistory,
      user: req.session.username || null,
      error: null,
      isAdmin: req.session.isAdmin
    });
  } catch (error) {
    console.error("Error fetching weather history:", error);
    res.render("weather-history", {
      weatherData: [],
      user: req.session.username || null,
      error: "Error fetching weather history",
      isAdmin: req.session.isAdmin
    });
  }
});

app.get("/admin", isAdmin, async (req, res) => {
  try {
    const users = await User.find({ deletionDate: null });
    res.render("admin", {
      users: users,
      user: req.session.username, 
      isAdmin: req.session.isAdmin 
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).send("Error loading admin page");
  }
});


function isAdmin(req, res, next) {
  if (req.session.isAdmin) {
    next();
  } else {
    res.status(403).send("Access Denied");
  }
}

app.get("/admin/add-user", isAdmin, (req, res) => {
  res.render("add-user", {
    user: req.session.username, 
    isAdmin: req.session.isAdmin 
  });
});


app.post("/admin/add-user", isAdmin, async (req, res) => {
  const { username, password, isAdmin } = req.body;

  try {
    const newUser = new User({
      username,
      password: password,
      isAdmin: isAdmin === "on",
    });

    await newUser.save();

    res.redirect("/admin");
  } catch (error) {
    console.error("Error adding new user:", error);
    res.status(500).send("Failed to add new user");
  }
});

app.post("/delete-user", isAdmin, async (req, res) => {
  try {
    const userId = req.body.userId;
    await User.findByIdAndUpdate(userId, { deletionDate: new Date() });
    res.redirect("/admin");
  } catch (error) {
    console.error("Error marking user as deleted:", error);
    res.status(500).send("Error deleting user");
  }
});


app.get("/edit-user/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
       
        return res.status(404).send("User not found");
    }
    res.render("edit-user", { user,isAdmin: req.session.isAdmin });
} catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).send("Internal Server Error");
}
});


app.post("/users/edit/:userId", async (req, res) => {
  const { username, password } = req.body;
 
  let isAdmin = req.body.isAdmin === 'true';

  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).send("User not found");
    }

    user.username = username;
    if (password) user.password = password;
    user.isAdmin = isAdmin;

    await user.save();
    res.redirect("/admin");
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).send("Server error");
  }
});


app.get("/signup", (req, res) => {
  res.render("sign-up", {
    query: req.query,
    error: null,
    user: null,
    isAdmin: req.session.isAdmin
  });
});

app.post("/signup", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = new User({ username, password });
    await user.save();
    res.redirect("/login");
  } catch (error) {
    res.status(500).send("Error registering new user, please try again.");
    res.render("sign-up", { error: "An error message", query: req.query, isAdmin: req.session.isAdmin });
  }
});



app.get("/exchange-rate", async (req, res) => {
  const apiKey = process.env.EXCHANGE_RATE_API_KEY;
  const fromCurrency = req.query.from || 'KZT';
  const toCurrency = req.query.to || 'USD'; 
  const url = `https://api.exchangerate-api.com/v4/latest/${fromCurrency}?apiKey=${apiKey}`;

  try {
    const response = await axios.get(url);
    const rates = response.data.rates;
    const rate = rates[toCurrency];

    let user = null;
    if (req.session && req.session.userId) {
      user = await User.findById(req.session.userId);
    }

    
    if (user) {
      const newExchangeRate = new ExchangeRate({
        fromCurrency,
        toCurrency,
        rate,
        userId: user._id
      });
      await newExchangeRate.save();
    }

    res.render("exchange-rate", { 
      rate, 
      fromCurrency, 
      toCurrency, 
      user,
      isAdmin: req.session.isAdmin
    });
  } catch (error) {
    console.error("Error fetching exchange rate:", error);
    res.render("exchange-rate", { 
      error: "Error, please try again",
      user: user || null
    });
  }
});

app.get("/exchange-rate-history", async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.redirect("/login");
  }

  try {
    const history = await ExchangeRate.find({ userId: req.session.userId }).sort({ timestamp: -1 });
    res.render("exchange-rate-history", { history, user: await User.findById(req.session.userId), isAdmin: req.session.isAdmin });
  } catch (error) {
    console.error("Error fetching exchange rate history:", error);
    res.render("exchange-rate-history", { 
      error: "Error retrieving your exchange rate history.",
      user: await User.findById(req.session.userId),
      isAdmin: req.session.isAdmin
    });
  }
});


app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
