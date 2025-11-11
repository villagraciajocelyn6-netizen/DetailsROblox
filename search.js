const fetch = require('node-fetch');

const PROXY = 'https://corsproxy.io/?';

exports.handler = async (event, context) => {
    // Enable CORS
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const { username } = JSON.parse(event.body);

        if (!username) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Username is required' })
            };
        }

        // Get user info
        const userResponse = await fetch(PROXY + 'https://users.roblox.com/v1/usernames/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                usernames: [username],
                excludeBannedUsers: false
            })
        });

        const userData = await userResponse.json();

        if (!userData.data || userData.data.length === 0) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ error: 'User not found' })
            };
        }

        const user = userData.data[0];
        const userIdValue = user.id;

        // Fetch additional data in parallel
        const [avatarData, friendsData, followersData, followingData, robuxData] = await Promise.allSettled([
            fetch(PROXY + `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userIdValue}&size=150x150&format=Png&isCircular=false`).then(r => r.json()),
            fetch(PROXY + `https://friends.roblox.com/v1/users/${userIdValue}/friends/count`).then(r => r.json()),
            fetch(PROXY + `https://friends.roblox.com/v1/users/${userIdValue}/followers/count`).then(r => r.json()),
            fetch(PROXY + `https://friends.roblox.com/v1/users/${userIdValue}/followings/count`).then(r => r.json()),
            fetch(PROXY + `https://economy.roblox.com/v1/users/${userIdValue}/currency`).then(r => r.json())
        ]);

        // Build response object
        const response = {
            success: true,
            username: user.name,
            displayName: user.displayName,
            userId: userIdValue,
            avatarUrl: avatarData.status === 'fulfilled' && avatarData.value.data?.[0]?.imageUrl || null,
            friends: friendsData.status === 'fulfilled' ? friendsData.value.count : null,
            followers: followersData.status === 'fulfilled' ? followersData.value.count : null,
            following: followingData.status === 'fulfilled' ? followingData.value.count : null,
            robux: robuxData.status === 'fulfilled' && robuxData.value.robux !== undefined ? robuxData.value.robux : 'Private'
        };

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(response)
        };

    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Internal server error', message: error.message })
        };
    }
};