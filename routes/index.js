const express = require('express');
const router = express.Router();
const Anime = require('../models/Anime');
const Genre = require('../models/Genre');
const Episode = require('../models/Episode');
const { ensureAuthenticatedUser } = require('../middleware/auth');

/**
 * GET /
 * Home Route - Displays Animes, Genres, and Latest Episodes
 * Supports Search and Genre Filtering
 */
router.get('/', ensureAuthenticatedUser, async (req, res) => {
    // 1. Initialize Query Parameters & State
    const searchQuery = req.query.q || '';
    const selectedGenre = req.query.genre || '';
    const renderData = {
        session: req.session,
        messages: req.flash(),
        searchQuery,
        selectedGenre,
        animes: [],
        genres: [],
        latestEpisodes: [],
        isSearchResult: !!(searchQuery || selectedGenre)
    };

    try {
        // 2. Parallel Data Fetching (Genres)
        const genres = await Genre.find().lean();

        // 3. Exact Match Search Logic
        if (searchQuery) {
            const exactMatch = await Anime.findOne({ 
                name: new RegExp(`^${searchQuery}$`, 'i') 
            }).populate('genres');

            if (exactMatch) {
                return res.redirect(`/anime/${exactMatch._id}`);
            }
        }

        // 4. Build Dynamic Anime Query
        const animeQuery = {};
        if (searchQuery) {
            animeQuery.name = { $regex: searchQuery, $options: 'i' };
        }
        if (selectedGenre) {
            animeQuery.genres = selectedGenre;
        }

        // 5. Fetch Animes with Populated Metadata
        const animes = await Anime.find(animeQuery)
            .populate('genres')
            .populate({
                path: 'seasons.episodes',
                model: 'Episode'
            });

        // 6. Modern Episode Extraction (Optimized for Premium UI)
        // Flattens seasons and episodes into a single "Latest" feed
        const allEpisodes = animes.flatMap(anime => 
            (anime.seasons || []).flatMap(season => 
                (season.episodes || [])
                    .filter(ep => ep) // Filter out nulls
                    .map(episode => ({
                        ...episode._doc,
                        anime: anime,
                        seasonNumber: season.seasonNumber
                    }))
            )
        );

        // Sort by date descending and take top 9
        const latestEpisodes = allEpisodes
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 9);

        // 7. Genre Reordering (Active Genre First)
        let sortedGenres = [...genres];
        if (selectedGenre) {
            const index = sortedGenres.findIndex(g => g._id.toString() === selectedGenre);
            if (index !== -1) {
                const [selected] = sortedGenres.splice(index, 1);
                sortedGenres.unshift(selected);
            }
        }

        // 8. Final Render Execution
        res.render('index', {
            ...renderData,
            animes,
            genres: sortedGenres,
            latestEpisodes
        });

    } catch (err) {
        console.error('Home Route Error:', err);
        req.flash('error', 'An error occurred while loading the homepage');
        
        // Return fallback state to prevent frontend crashes
        res.render('index', renderData);
    }
});

/**
 * GET /search
 * Search Redirect logic - Maintains compatibility with existing forms
 */
router.get('/search', ensureAuthenticatedUser, (req, res) => {
    const { q = '', genre = '' } = req.query;
    const params = new URLSearchParams({ q, genre });
    res.redirect(`/?${params.toString()}`);
});

module.exports = router;