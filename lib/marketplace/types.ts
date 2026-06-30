export interface MarketplaceOwner {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

export interface MarketplaceAgent {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  category: string | null;
  tags: string[];
  status: string;
  visibility: string;
  rating: number;
  downloads: number;
  created_at: string;
  updated_at: string;
  owner: MarketplaceOwner | null;
  skills: string[];
  model: string | null;
  is_favorited: boolean;
  is_following: boolean;
  is_owner: boolean;
}
