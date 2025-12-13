const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve: (handler: (req: Request) => Promise<Response> | Response) => void;
};

interface SteamAppDetails {
  success: boolean;
  data?: {
    name: string;
    type: string;
    is_free: boolean;
    price_overview?: {
      final: number;
      initial: number;
      discount_percent: number;
      currency: string;
    };
    release_date?: {
      coming_soon: boolean;
      date: string;
    };
    genres?: Array<{ description: string }>;
    categories?: Array<{ description: string }>;
  };
}

interface SteamReviewsResponse {
  success: number;
  query_summary: {
    num_reviews: number;
    review_score: number;
    review_score_desc: string;
    total_positive: number;
    total_negative: number;
    total_reviews: number;
  };
  reviews: Array<{
    review: string;
    voted_up: boolean;
    votes_up: number;
    author: {
      playtime_forever: number;
    };
  }>;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { appId } = await req.json();
    
    if (!appId) {
      return new Response(
        JSON.stringify({ error: 'AppID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching Steam data for AppID:', appId);

    // Fetch game details
    const detailsUrl = `https://store.steampowered.com/api/appdetails?appids=${appId}`;
    const detailsResponse = await fetch(detailsUrl);
    const detailsData = await detailsResponse.json() as Record<string, SteamAppDetails>;
    
    const gameDetails = detailsData[appId];
    
    if (!gameDetails?.success || !gameDetails.data) {
      return new Response(
        JSON.stringify({ error: 'Game not found or invalid AppID' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch reviews
    const reviewsUrl = `https://store.steampowered.com/appreviews/${appId}?json=1&filter=recent&language=english&num_per_page=20`;
    const reviewsResponse = await fetch(reviewsUrl);
    const reviewsData = await reviewsResponse.json() as SteamReviewsResponse;

    if (reviewsData.success !== 1) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch reviews' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const game = gameDetails.data;
    const reviewSummary = reviewsData.query_summary;

    // Calculate metrics
    const positiveRatio = reviewSummary.total_reviews > 0
      ? Math.round((reviewSummary.total_positive / reviewSummary.total_reviews) * 100)
      : 0;

    // Extract review texts (filter out very short reviews)
    const reviewTexts = reviewsData.reviews
      .filter(r => r.review.length > 50)
      .map(r => r.review)
      .slice(0, 15);

    // Calculate average playtime from reviews
    const avgPlaytime = reviewsData.reviews.length > 0
      ? reviewsData.reviews.reduce((sum, r) => sum + r.author.playtime_forever, 0) / reviewsData.reviews.length / 60
      : 0;

    // Get price (convert from cents to dollars)
    const price = game.price_overview?.final 
      ? game.price_overview.final / 100 
      : 0;

    // Estimate owners based on review count (rough heuristic: ~1-2% of owners leave reviews)
    const estimatedOwners = Math.round(reviewSummary.total_reviews * 75);

    // Recent players estimate (rough heuristic based on recent review activity)
    const recentPlayers = Math.round(reviewsData.reviews.length * 50);

    // Determine if the game is available in the store
    // Game is available if it's not coming soon and has a valid type
    const isAvailableInStore = 
      !game.release_date?.coming_soon && 
      game.type === 'game' &&
      gameDetails.success;

    // Parse release date - convert from Steam's format to ISO-like format
    let releaseDate = 'Unknown';
    if (game.release_date?.date) {
      try {
        // Steam dates can be like "Mar 24, 2014" or "2014"
        const dateStr = game.release_date.date;
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          releaseDate = date.toISOString().split('T')[0]; // Format as YYYY-MM-DD
        } else {
          // If parsing fails, keep the original string
          releaseDate = dateStr;
        }
      } catch {
        releaseDate = game.release_date.date;
      }
    }

    const formattedData = {
      title: game.name,
      positiveRatio,
      totalReviews: reviewSummary.total_reviews,
      estimatedOwners,
      recentPlayers,
      price,
      averagePlaytime: Math.round(avgPlaytime * 10) / 10,
      lastUpdated: game.release_date?.date || 'Unknown',
      reviews: reviewTexts,
      tags: game.genres?.map(g => g.description) || [],
      steamUrl: `https://store.steampowered.com/app/${appId}`,
      reviewScoreDesc: reviewSummary.review_score_desc,
      isAvailableInStore,
      releaseDate,
    };

    console.log('Successfully fetched Steam data for:', formattedData.title);

    return new Response(
      JSON.stringify(formattedData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in fetch-steam-game:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Failed to fetch Steam data' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
