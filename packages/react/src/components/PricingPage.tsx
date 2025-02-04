"use client";
import React, { useState, useEffect } from "react";
import { useCustomSwr } from "../hooks/useCustomSwr";

const makeImportant = (className?: string) => {
  if (!className) return '';
  return className.split(' ').map(cls => `!${cls}`).join(' ');
};

const styles = {
  container: {
    display: 'flex',
    gap: '16px',
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: 0,
    border: '1px solid red',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: '6px',
    backgroundColor: '#fff',
    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  },
  card: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-start',
    overflow: 'hidden',
    borderRadius: '6px',
    border: '1px solid #e5e5e5',
    backgroundColor: '#fff',
    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  },
  header: {
    display: 'flex',
    width: '100%',
    flexDirection: 'column' as const,
    alignItems: 'flex-start',
    gap: '16px',
    borderBottom: '1px solid #e5e5e5',
    backgroundColor: '#fafafa',
    padding: '48px',
  },
  titleSection: {
    display: 'flex',
    width: '100%',
    flexDirection: 'column' as const,
    alignItems: 'flex-start',
    gap: '8px',
  },
  title: {
    fontSize: '24px',
    fontWeight: 600,
    color: '#111',
  },
  description: {
    fontSize: '18px',
    fontWeight: 500,
    color: '#111',
  },
  content: {
    display: 'flex',
    width: '100%',
    flexDirection: 'column' as const,
    alignItems: 'flex-start',
    gap: '24px',
    padding: '48px',
    backgroundColor: '#fff',
  },
  pricing: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '8px',
  },
  amount: {
    fontSize: '32px',
    fontWeight: 600,
    color: '#111',
  },
  interval: {
    fontSize: '16px',
    fontWeight: 500,
    color: '#666',
    paddingBottom: '4px',
  },
  entitlementsList: {
    display: 'flex',
    width: '100%',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  entitlementItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '16px',
    color: '#666',
  },
  purchaseButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '16px',
    color: '#666',
  },
};

interface PricingPageProps {
  classNames?: {
    container?: string;
    card?: string;
    header?: string;
    titleSection?: string;
    title?: string;
    description?: string;
    content?: string;
    pricing?: string;
    amount?: string;
    interval?: string;
    entitlementsList?: string;
    entitlementItem?: string;
  };
}

export default function PricingPage({ classNames }: PricingPageProps) {
  const { data, error, isLoading } = useCustomSwr({
    url: "https://api.useautumn.com/public/products",
  });
  const [importantClasses, setImportantClasses] = useState<PricingPageProps['classNames']>({});

  useEffect(() => {
    if (classNames) {
      const important = Object.entries(classNames).reduce((acc, [key, value]) => ({
        ...acc,
        [key]: makeImportant(value)
      }), {});
      setImportantClasses(important);
    }
  }, [classNames]);

  return (
    <div style={styles.container} className={classNames?.container}>
      {data?.map((product: any, index: number) => (
        <PricingCard 
          key={product.id || `product-${index}`} 
          product={product} 
          classNames={importantClasses} 
        />
      ))}
    </div>
  );
}

interface PricingCardProps {
  product: any;
  classNames?: PricingPageProps['classNames'];
}

const PricingCard = ({ product, classNames = {} }: PricingCardProps) => {
  const fixedPrices = product.fixed_prices;
  const entitlements = product.entitlements;

  return (
    <div style={styles.card} className={classNames.card}>
      <div style={styles.header} className={classNames.header}>
        <div style={styles.titleSection} className={classNames.titleSection}>
          <div style={styles.title} className={classNames.title}>
            {product.name}
          </div>
          <div style={styles.description} className={classNames.description}>
            {product.description}
          </div>
        </div>
      </div>
      
      <div style={styles.content} className={classNames.content}>
        {fixedPrices.map((price: any, index: number) => (
          <div 
            key={price.id || `price-${index}`} 
            style={styles.pricing} 
            className={classNames.pricing}
          >
            <span style={styles.amount} className={classNames.amount}>
              ${price.config.amount}
            </span>
            <div style={styles.interval} className={classNames.interval}>
              per {price.config.interval}
            </div>
          </div>
        ))}

        <div style={styles.entitlementsList} className={classNames.entitlementsList}>
          {entitlements.map((entitlement: any, index: number) => (
            <div 
              key={entitlement.id || `entitlement-${index}`} 
              style={styles.entitlementItem} 
              className={classNames.entitlementItem}
            >
              <span>✓</span>
              <span>{entitlement.feature.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
