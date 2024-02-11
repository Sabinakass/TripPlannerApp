require("dotenv").config();
const express = require("express");
const session = require("express-session");
const axios = require("axios");
const mongoose = require("mongoose");
const User = require("./userModel");
const Weather = require("./weatherModel");
const ExchangeRate = require('./ExchangeRateModel');
const AirQuality = require('./AirQuality');


const adminUsername = process.env.ADMIN_USERNAME;
const adminPassword = process.env.ADMIN_PASSWORD;


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
  
    try {
      const response = await axios.get(url);
      const weatherData = response.data;
      const weatherDescription = weatherData.weather[0].description;
      const iconCode = weatherData.weather[0].icon;
      const iconUrl = `http://openweathermap.org/img/w/${iconCode}.png`;
  
      const newWeatherSearch = new Weather({
        city: weatherData.name,
        temperature: weatherData.main.temp,
        description: weatherDescription,
        icon: iconUrl,
        userId: req.session.userId,
      });
  
      await newWeatherSearch.save();
  
      res.render("index", {
        weather: {
          city: weatherData.name,
          temperature: weatherData.main.temp,
          description: weatherDescription,
          icon: iconUrl,
        },
        error: null,
        user: req.session.username,
      });
    } catch (error) {
      console.error(
        "Error fetching weather data:",
        error.response ? error.response.data : error
      );
      res.render("index", {
        weather: null,
        error: "Error, please try again",
        user: req.session.username,
      });
    }
  });

app.get("/login", (req, res) => {
  res.render("login", {
    query: req.query,
    error: null,
    user: req.session ? req.session.user : null,
  });
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (username === adminUsername && password === adminPassword) {
    req.session.isAdmin = true;
    req.session.username = username;

    return res.redirect("/admin");
  }

  const user = await User.findOne({ username });
  if (user && password === user.password) {
    req.session.userId = user._id;
    req.session.username = user.username;
    req.session.isAdmin = false;

    return res.redirect("/");
  } else {
    res.render("login", { error: "Invalid username or password" });
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
    const weatherHistory = await Weather.find({ userId: req.session.userId });
    res.render("weather-history", {
      weatherData: weatherHistory,
      user: req.session.username || null,
      error: null,
    });
  } catch (error) {
    console.error("Error fetching weather history:", error);
    res.render("weather-history", {
      weatherData: [],
      user: req.session.username || null,
      error: "Error fetching weather history",
    });
  }
});

app.get("/admin", isAdmin, async (req, res) => {
  try {
    const users = await User.find({ deletionDate: null });
    res.render("admin", { users });
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
  res.render("add-user");
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
  const userId = req.params.id;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).send("User not found");
    }

    res.render("edit-user", { user });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/users/edit/:userId", async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).send("User not found");
    }

    user.username = username || user.username;

    if (password) {
      user.password = password;
    }
    user.updateDate = new Date();
    await user.save();
    res.redirect("/admin");
  } catch (error) {
    res.status(500).send("Server error");
  }
});

app.get("/signup", (req, res) => {
  res.render("sign-up", {
    query: req.query,
    error: null,
    user: null,
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
    res.render("sign-up", { error: "An error message", query: req.query });
  }
});

app.get("/news", async (req, res) => {
  const apiKey = process.env.NEWS_API_KEY;
  const url = `https://newsapi.org/v2/top-headlines?country=us&apiKey=${apiKey}`;

  try {
    const response = await axios.get(url);
    const articles = response.data.articles;
    res.render("news", { articles });
  } catch (error) {
    console.error("Error fetching news:", error);
    res.render("news", { error: "Error, please try again" });
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
      user
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
    res.render("exchange-rate-history", { history, user: await User.findById(req.session.userId) });
  } catch (error) {
    console.error("Error fetching exchange rate history:", error);
    res.render("exchange-rate-history", { 
      error: "Error retrieving your exchange rate history.",
      user: await User.findById(req.session.userId)
    });
  }
});
app.get("/air-quality/:city", async (req, res) => {
  if (!req.session.userId) {
    return res.redirect("/login");
  }

  const city = encodeURIComponent(req.params.city);
  const url = `https://api.openaq.org/v1/latest?city=${city}&limit=1`;

  try {
    const response = await axios.get(url);
    if (response.data && response.data.results.length > 0) {
      const locationData = response.data.results[0];
      const aqiData = locationData.measurements.find(m => m.parameter === 'pm25'); // Simplifying to PM2.5 for demonstration

      if (!aqiData) throw new Error('AQI data not available for this location.');

      const airQuality = new AirQuality({
        city: city,
        aqi: aqiData.value,
        mainPollutant: aqiData.parameter,
        userId: req.session.userId
      });
      await airQuality.save();

      res.render("index", {
        airQuality:airQuality,
        city: city,
        aqi: aqiData.value,
        mainPollutant: aqiData.parameter,
        user: await User.findById(req.session.userId)
      });
    } else {
      throw new Error("No air quality data found for this city.");
    }
  } catch (error) {
    console.error("Error fetching air quality data:", error);
    res.render("air-quality", {
      error: "Error, please try again",
      user: await User.findById(req.session.userId)
    });
  }
});


app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
